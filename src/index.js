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

const app = express();

app.get("/", (req, res) => {
  res.send("Vehicle Tracking 2021");
});

const port = process.env.PORT || 8080;

app.listen(port, () => console.log("Example app listening on port 3000!"));
