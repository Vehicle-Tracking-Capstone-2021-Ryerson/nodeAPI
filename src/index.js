import express from "express";
import mongoose from "mongoose";

require("dotenv").config();

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

//checks for valid userId
const exists = (userId) => {
  return true;
};

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
app.get("/getReport", (userId, res) => {
  if (exists(userId) === true) {
    res.send({ userScore: 81, accidents: 0, drivingHistory: "..." });
  } else {
    res.send("Error: User not found");
  }
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
