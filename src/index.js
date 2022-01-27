import express from "express";
import mongoose from "mongoose";

const { Schema } = mongoose;

require("dotenv").config();

const UserSchema = new Schema({
  userid: Number,
  username: String,
  password: String,
  userscore: Number,
  accidents: Number,
  drivinghistory: mongoose.Mixed, // to be expanded
});

const DrivingUser = mongoose.model("DrivingUser", UserSchema);

const user1 = new DrivingUser({
  userid: 1,
  username: "testperson",
  password: "tEsT",
  userscore: 81,
  accidents: 0,
  drivinghistory: {},
});

const user2 = new DrivingUser({
  userid: 2,
});

const connectToDB = async () => {
  await mongoose.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const user1s = await DrivingUser.find({ userid: user1.userid });
  const user2s = await DrivingUser.find({ userid: user2.userid });

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
   Output: if successful returns data profile, if unsuccessful returns empty body
   Called by: Real-Time Monitoring System and Web Application
*/
app.get("/auth", (req, res) => {
  res.send("Authentication Successful");
});

/* Initiates a driving session 
   Input: user id
   Output: session token used to track the driving session
   Called by: Real-Time Monitoring System
*/
app.get("/start", (req, res) => {
  res.send("Creating Session Token");
});

/* Ends the driving session 
   Input: session token
   Output: success
   Called by: Real-Time Monitoring System
*/
app.get("/end", (req, res) => {
  res.send("Session Ended");
});

/* Get status of the current session
   Can also be expanded to include accedent detection
   Input: GPS coordinate data or any other status-related inputs
   Output: current roads speed limit or any other status-related outputs
   Called by: Real-Time Monitoring System
*/
app.get("/status", (req, res) => {
  res.send({ speedLimit: 50, hasAccidentOccured: false });
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

app.listen(port, () => console.log("Example app listening on port 3000!"));
