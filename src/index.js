import express from "express";
import mongoose from "mongoose";
import { Client } from "@googlemaps/google-maps-services-js";
import DrawingManager from "google-maps-drawing-tools";
import { Storage } from "@google-cloud/storage";
import axios from "axios";
import cors from "cors";

// Google Storage
const googleStorage = new Storage();
const bucketName = "session-data";

// Mongoose
const { Schema } = mongoose;

// Token Generator
const allCapsAlpha = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const allLowerAlpha = [..."abcdefghijklmnopqrstuvwxyz"];
const allNumbers = [..."0123456789"];

const base = [...allCapsAlpha, ...allNumbers, ...allLowerAlpha];

const generator = (base, len) => {
  return [...Array(len)]
    .map((i) => base[(Math.random() * base.length) | 0])
    .join("");
};

require("dotenv").config();

const UserSchema = new Schema({
  username: String,
  password: String,
  userscore: Number,
  accidents: Number,
  drivinghistory: [mongoose.Mixed], // to be expanded
});

const DrivingUser = mongoose.model("DrivingUser", UserSchema);

const connectToDB = async () => {
  await mongoose.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("Connected!");
};

console.log("Connecting to database...");

try {
  connectToDB();
} catch (e) {
  console.log("ERROR! Can't connect to db!");
}

const app = express();
app.use(cors());

const whitelist = ["http://localhost"];

app.get("/", (req, res) => {
  res.send("Vehicle Tracking 2021");
});

/* Authenticate a driver/user based on pin input 
   Input: username, pin
   Output: if successful returns the user Id, if unsuccessful returns Authentication Failed
   Called by: Real-Time Monitoring System
*/
app.get("/auth", async (req, res) => {
  const users = await DrivingUser.find({
    username: req.query.username,
    password: req.query.password,
  });

  if (users.length === 0) {
    res.status(401).send("Authentication Failed");
  } else if (users.length === 1) {
    res.send(users[0]._id);
  } else {
    res.status(409).send("Error");
  }
});

/* Initiates a driving session 
   Input: user id
   Output: session token used to track the driving session
   Called by: Real-Time Monitoring System
*/
app.get("/start", async (req, res) => {
  const user = await DrivingUser.find({ _id: req.query._id });

  if (user.length === 0) {
    res.send("User Does Not Exist");
  } else if (user.length === 1) {
    const token = generator(base, 10);
    const currentdate = new Date();

    const datetime = `${
      currentdate.getMonth() + 1
    }/${currentdate.getDate()}/${currentdate.getFullYear()} @ ${currentdate.getHours()}:${currentdate.getMinutes()}:${currentdate.getSeconds()}`;

    await DrivingUser.updateOne(user[0], {
      $addToSet: {
        drivinghistory: [{ date: datetime, session: token, status: "active" }],
      },
    });

    res.send(token);
  } else {
    res.status(409).send("Error");
  }
});

/* Ends the driving session 
   Input: user Id and session token
   Output: success
   Called by: Real-Time Monitoring System
*/
app.get("/end", async (req, res) => {
  const file = googleStorage
    .bucket(bucketName)
    .file(req.query.token)
    .createReadStream();
  let buf = "";

  file
    .on("data", (d) => {
      buf += d;
    })
    .on("end", async () => {
      buf = JSON.parse(buf);

      let overSpeed = [];
      let speedCost = 0;
      let tailgating = [];
      let tailCost = 0;
      let revCost = 0;
      let fuelStart;
      let fuelEnd;
      let drivingscore = 100;

      if (buf.gpsData.length !== 0 && buf.OBD_data.length !== 0) {
        buf.gpsData.forEach((reading, index) => {
          const date = new Date();
          const dateFuture = new Date();
          date.setTime(Date.parse(reading.time));
          dateFuture.setTime(date.getTime() + 5000);

          buf.OBD_data.forEach((car) => {
            const carDate = new Date();
            carDate.setTime(Date.parse(car.time));
            if (
              carDate > date &&
              carDate < dateFuture &&
              car.speed > reading.speed * 1.1 &&
              reading.speed !== "0"
            ) {
              overSpeed.push({
                speed: car.speed,
                speedLimit: reading.speed,
                street: reading.street,
                time: car.time,
                currentCoord: { lat: reading.lat, lon: reading.lon },
                nextCoord: {
                  lat: buf.gpsData[index + 1].lat,
                  lon: buf.gpsData[index + 1].lon,
                },
              });
            }
          });
        });

        overSpeed = overSpeed.filter(
          (value, index, self) =>
            index === self.findIndex((t) => t.time === value.time)
        );

        overSpeed.forEach((entry) => {
          speedCost += entry.speed / entry.speedLimit;
        });
      } else {
        overSpeed = undefined;
      }

      if (buf.blindspotData.F.length !== 0 && buf.OBD_data.length !== 0) {
        const date = new Date();
        const datePast = new Date();
        const dateFuture = new Date();
        const carDate = new Date();

        buf.blindspotData.F.forEach((reading, index) => {
          if (
            reading.data !== "0" &&
            index - 1 > 0 &&
            index + 1 < buf.blindspotData.F.length &&
            buf.blindspotData.F[index - 1].data !== "0" &&
            buf.blindspotData.F[index + 1].data !== "0"
          ) {
            date.setTime(Date.parse(reading.time));
            datePast.setTime(date.getTime() - 4000);
            dateFuture.setTime(date.getTime() + 4000);

            buf.OBD_data.forEach((car) => {
              carDate.setTime(Date.parse(car.time));

              if (
                carDate > datePast &&
                carDate < dateFuture &&
                car.speed >= 30
              ) {
                tailgating.push({
                  data: reading.data,
                  speed: car.speed,
                  time: reading.time,
                });
              }
            });
          }
        });

        tailgating.forEach(() => {
          tailCost += 5;
        });
      } else {
        tailgating = undefined;
      }

      if (buf.OBD_data.length !== 0) {
        let avgRev = 0;

        buf.OBD_data.forEach((reading) => {
          avgRev += parseFloat(reading.rpm);
        });

        if (avgRev / buf.OBD_data.length > 5000) {
          revCost = 2;
        }

        fuelStart = JSON.stringify(buf.OBD_data[0].fuel).replace(
          /^\s+|\s+$/g,
          ""
        );
        fuelEnd = JSON.stringify(
          buf.OBD_data[buf.OBD_data.length - 1].fuel
        ).replace(/^\s+|\s+$/g, "");
      }

      drivingscore = drivingscore - speedCost - tailCost - revCost;

      const user = await DrivingUser.findOneAndUpdate(
        {
          _id: req.query._id,
          "drivinghistory.session": req.query.token,
        },
        {
          $set: {
            "drivinghistory.$.status": "finished",
            "drivinghistory.$.drivingscore": drivingscore,
            "drivinghistory.$.speedCost": speedCost,
            "drivinghistory.$.tailCost": tailCost,
            "drivinghistory.$.revCost": revCost,
            "drivinghistory.$.fuelStart": fuelStart,
            "drivinghistory.$.fuelEnd": fuelEnd,
            "drivinghistory.$.overSpeed": overSpeed,
            "drivinghistory.$.tailgating": tailgating,
          },
        },
        { new: true }
      );

      if (user == null) {
        res.send("Session Does Not Exist");
      } else {
        let check = false;
        user.drivinghistory.forEach((x) => {
          if (x.session === req.query.token && x.status === "finished") {
            check = true;
          }
        });

        if (check === true) {
          res.send("Session Ended");
          let scoreSum = 0;
          let count = 0;

          user.drivinghistory.forEach((session) => {
            if (session.drivingscore !== undefined) {
              scoreSum += session.drivingscore;
              count += 1;
            }
          });

          if (buf.accident !== undefined) {
            if (buf.accident) {
              user.accidents += 1;
            }
          }

          await DrivingUser.updateOne(
            { _id: req.query._id },
            { userscore: scoreSum / count },
            { accidents: user.accidents }
          );
        } else {
          res.status(409).send("Session Failed to End");
        }
      }
    });
});

/* Get the current street name and the speed limit
   Input: GPS coordinate data
   Output: current roads speed limit, name
   Called by: Real-Time Monitoring System
*/
app.get("/speedLimit", (req, res) => {
  // const path = "38.75807927603043,-9.03741754643809;38.6896537,-9.1770515;41.1399289,-8.6094075";

  const config = {
    method: "get",
    url: `http://dev.virtualearth.net/REST/v1/Routes/SnapToRoad?points=${req.query.location_data}&includeSpeedLimit=true&key=${process.env.BING_API_KEY}`,
    headers: {},
  };

  // eslint-disable-next-line prettier/prettier
  axios(config).then(({ data: { resourceSets: [{ resources: [{ snappedPoints }] }] } }) => {
        const result = [];
        snappedPoints.forEach((x) => {
          result.push({
            street: x.name,
            speedLimit: x.speedLimit,
            speedUnit: x.speedUnit,
          });
        });

        res.send(result);
      }
    )
    .catch((error) => console.log(error));
});

/* Send back necessary data to display the report for the current user/driver
   Input: user id
   Output: user score, accidents, driving history
   Called by: Web Application
*/
app.get("/getReport", async (req, res) => {
  await DrivingUser.find({ _id: req.query._id }).then((users) => {
    if (users.length === 0) {
      res.status(409).send("Error: User not found");
    } else {
      res.send(users[0].drivinghistory);
    }
  });
});

/* Add a new user
   Input: new user's username and password
   Output: success/error
   Called by: Web Application
*/
app.get("/addUser", async (req, res) => {
  await DrivingUser.find({ username: req.query.username }).then((users) => {
    if (users.length === 0) {
      const newUser = new DrivingUser({
        username: req.query.username,
        password: req.query.password,
        userscore: null,
        accidents: 0,
        drivinghistory: [],
      });

      newUser.save();
      res.send("Success: A new user has been created");
    } else {
      res.status(409).send("Error: That username is already taken");
    }
  });
});

/* Add a new user
   Input: new user's username and password
   Output: success/error
   Called by: Web Application
*/
app.get("/removeUser", async (req, res) => {
  await DrivingUser.findByIdAndDelete(req.query._id).then((users) => {
    if (users.length === 0) {
      res.status(404).send("Error: User not found");
    } else {
      res.send("Success: User was deleted");
    }
  });
});

/* Retrieves all users in the database
   Called by: Web Application
*/
app.get("/retrieveUsers", async (req, res) => {
  await DrivingUser.find().then((users) => {
    if (users.length === 0) {
      res.send("Error: There are no users in the database");
    } else {
      const result = [];
      users.forEach((x) => {
        if (x.drivinghistory[x.drivinghistory.length - 1] === undefined) {
          result.push({
            // eslint-disable-next-line no-underscore-dangle
            id: x._id,
            username: x.username,
            userscore: x.userscore,
            lastDrivingSession: null,
          });
        } else {
          result.push({
            // eslint-disable-next-line no-underscore-dangle
            id: x._id,
            username: x.username,
            userscore: x.userscore,
            lastDrivingSession:
              x.drivinghistory[x.drivinghistory.length - 1].date,
          });
        }
      });

      res.send(result);
    }
  });
});

/*
  Retrieves the Last Person to Use the Car and Also the Last Session
  Called by: Web Application
*/
app.get("/latestUser", async (req, res) => {
  await DrivingUser.find().then((users) => {
    if (users.length === 0) {
      res.send("Error: There are no users in the database");
    } else {
      const result = [];
      users.forEach((x) => {
        if (x.drivinghistory[x.drivinghistory.length - 1] === undefined) {
          result.push({
            // eslint-disable-next-line no-underscore-dangle
            username: x.username,
            sessionTime: null,
          });
        } else {
          result.push({
            // eslint-disable-next-line no-underscore-dangle
            username: x.username,
            drivingscore:
              x.drivinghistory[x.drivinghistory.length - 1].drivingscore,
            sessionTime: x.drivinghistory[x.drivinghistory.length - 1].date,
          });
        }
      });

      const date = new Date();
      const latest = Math.max(
        ...result.map((entry) => {
          date.setTime(Date.parse(entry.sessionTime));
          if (!Number.isNaN(date.getTime())) {
            return date.getTime();
          }
          return -1;
        })
      );

      date.setTime(latest);

      result.forEach((entry, index) => {
        if (Date.parse(entry.sessionTime) === date.getTime()) {
          res.send(result[index]);
        }
      });
    }
  });
});

/*
  Finds the Total Number of Accidents the Car has Been Involved in Across all Users
  Called by: Web Application
*/
app.get("/totalAccidents", async (req, res) => {
  await DrivingUser.find().then((users) => {
    if (users.length === 0) {
      res.send("Error: There are no users in the database");
    } else {
      let accident = 0;
      users.forEach((x) => {
        if (x.accidents !== undefined) {
          accident += x.accidents;
        }
      });

      res.send({ accidents: accident });
    }
  });
});

/*
Generates the coordinates of our driving session
*/
app.get("/getDrivingMap", async (req, res) => {
  const file = googleStorage
    .bucket(bucketName)
    .file(req.query.token)
    .createReadStream();
  let buf = "";

  file
    .on("data", (d) => {
      buf += d;
    })
    .on("end", async () => {
      buf = JSON.parse(buf);

      if (buf.gpsData) {
        const { gpsData } = buf;
        const coordinates = [];
        gpsData.forEach((place) => {
          const { lat, lon } = place;
          coordinates.push({ lat: parseFloat(lat), lng: parseFloat(lon) });
        });

        const result = await DrivingUser.findOne({
          "drivinghistory.session": req.query.token,
        });

        let speedingHistoryCoords = {};
        result.drivinghistory.forEach((hist) => {
          if (hist.session === req.query.token && hist.overSpeed) {
            speedingHistoryCoords = hist.overSpeed;
          }
        });
        res.send({ coordinates, speedingHistoryCoords });
      } else {
        res.send([]);
      }
    });
});

/*
Generates the coordinates of our driving session
*/
app.get("/getReportData", async (req, res) => {
  const file = googleStorage
    .bucket(bucketName)
    .file(req.query.token)
    .createReadStream();
  let buf = "";

  file
    .on("data", (d) => {
      buf += d;
    })
    .on("end", async () => {
      buf = JSON.parse(buf);

      if (buf.gpsData) {
        const { gpsData } = buf;
        const coordinates = [];
        gpsData.forEach((place) => {
          const { lat, lon } = place;
          coordinates.push({ lat: parseFloat(lat), lng: parseFloat(lon) });
        });

        const result = await DrivingUser.findOne({
          "drivinghistory.session": req.query.token,
        });

        let sessionData = {};
        result.drivinghistory.forEach((hist) => {
          if (hist.session === req.query.token) {
            sessionData = hist;
          }
        });
        res.send(sessionData);
      } else {
        res.send([]);
      }
    });
});

const port = process.env.PORT || 8080;

app.listen(port, () => console.log("Example app listening on port 8080!"));
