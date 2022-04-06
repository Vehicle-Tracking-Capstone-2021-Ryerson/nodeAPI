import axios from "axios";

const datOne = require("../test-data.json");

const gpsDat = datOne.gpsData;

let gmapsURL = "https://maps.googleapis.com/maps/api/directions/json?origin=";

gpsDat.forEach((point, idx) => {
  const { lat, lon } = point;
  console.log(lat);
  console.log(lon);

  const coordinates = `${lat},${lon}`;

  if (idx === 0) {
    gmapsURL += coordinates;
    gmapsURL += "&waypoints=";
  } else if (idx !== gpsDat.length - 1) {
    gmapsURL += coordinates;
    gmapsURL += "|";
  } else {
    gmapsURL += "&destination=";
    gmapsURL += coordinates;
  }
});

const config = {
  method: "get",
  url: gmapsURL,
  headers: {},
};

axios(config).then((response) => {
  console.log(JSON.stringify(response.data));
});
