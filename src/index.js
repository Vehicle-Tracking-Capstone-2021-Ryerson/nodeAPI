import express from "express";
import mongoose from "mongoose";
import { Client } from "@googlemaps/google-maps-services-js";
import { Storage } from "@google-cloud/storage";
import axios from "axios";

const bucketName = "your-unique-bucket-name";
const filePath = "path/to/your/file";
const destFileName = "your-new-file-name";

// Creates a client
const googleStorage = new Storage();

async function uploadFile() {
  await googleStorage.bucket(bucketName).upload(filePath, {
    destination: destFileName,
  });

  console.log(`${filePath} uploaded to ${bucketName}`);
}

const { Schema } = mongoose;
const roadsClient = new Client({});

const allCapsAlpha = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const allLowerAlpha = [..."abcdefghijklmnopqrstuvwxyz"];
const allUniqueChars = [..."~!@#$%^&*()_+-=[]\\{}|;:'\",./<>?"];
const allNumbers = [..."0123456789"];

const base = [
  ...allCapsAlpha,
  ...allNumbers,
  ...allLowerAlpha,
  ...allUniqueChars,
];

const generator = (base, len) => {
  return [...Array(len)]
    .map((i) => base[(Math.random() * base.length) | 0])
    .join("");
};

require("dotenv").config();

const UserSchema = new Schema({
  userid: Number,
  username: String,
  password: String,
  userscore: Number,
  accidents: Number,
  drivinghistory: [mongoose.Mixed], // to be expanded
});

const DrivingUser = mongoose.model("DrivingUser", UserSchema);

const user1 = new DrivingUser({
  username: "testperson",
  password: "tEsT",
  userscore: 81,
  accidents: 0,
  drivinghistory: [],
});

const user2 = new DrivingUser({
  username: "User2",
  password: "9671111",
});

const connectToDB = async () => {
  await mongoose.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const user1s = await DrivingUser.find({ username: user1.username });
  const user2s = await DrivingUser.find({ username: user2.username });

  if (user1s.length === 0) {
    await user1.save();
  }

  if (user2s.length === 0) {
    await user2.save();
  }

  console.log("Connected!");
};

console.log("Connecting to database...");

try {
  connectToDB();
} catch (e) {
  console.log("ERROR! Can't connect to db!");
}

const app = express();

app.get("/", (req, res) => {
  res.send("Vehicle Tracking 2021");
});

/* Authenticate a driver/user based on pin input 
   Input: username, pin
   Output: if successful returns the user Id, if unsuccessful returns Authentication Failed
   Called by: Real-Time Monitoring System and Web Application
*/
app.get("/auth", async (req, res) => {
  const users = await DrivingUser.find({
    username: req.query.username,
    password: req.query.password,
  });

  if (users.length === 0) {
    res.send("Authentication Failed");
  } else if (users.length === 1) {
    res.send(users[0]._id);
  } else {
    console.log(users);
    res.send("Error");
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

    const datetime = `${currentdate.getDate()}/${
      currentdate.getMonth() + 1
    }/${currentdate.getFullYear()} @ ${currentdate.getHours()}:${currentdate.getMinutes()}:${currentdate.getSeconds()}`;

    await DrivingUser.updateOne(user[0], {
      $addToSet: {
        drivinghistory: [{ date: datetime, session: token, status: "active" }],
      },
    });

    res.send(token);
  } else {
    console.log(user);
    res.send("Error");
  }
});

/* Ends the driving session 
   Input: user Id and session token
   Output: success
   Called by: Real-Time Monitoring System
*/
app.get("/end", async (req, res) => {
  const user = await DrivingUser.findOneAndUpdate(
    {
      _id: req.query._id,
      "drivinghistory.session": req.query.token,
    },
    { $set: { "drivinghistory.$.status": "finished" } },
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
    } else {
      res.send("Session Failed to End");
    }
  }

  // uploadFile().catch(console.error);
});

/* Get status of the current session
   Can also be expanded to include accedent detection
   Input: tbd
   Output: tbd
   Called by: Real-Time Monitoring System
*/
app.get("/status", (req, res) => {
  res.send({ speedLimit: 50, hasAccidentOccured: false });
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
  const userId = 1;
  await DrivingUser.find({ userid: userId }).then((users) => {
    if (users.length === 0) {
      res.send("Error: User not found");
    } else {
      res.send(users[0]);
    }
  });
});

/* This will be used to get any specific data stored for a driver that will allow flexibility for application development
   Input: necessary data to get a specified data point
   Output: data if exists or an error otherwise
   Called by: Web Application
*/
app.get("/getSpecific/<data_point>", (req, res) => {
  res.send("This is a placeholder");
});

const port = process.env.PORT || 8080;

app.listen(port, () => console.log("Example app listening on port 8080!"));
