const express = require("express");
const authMiddelware = require("../middlewares/authMiddleware");
const { getOrgBloodStock, createHospitalInventory, getConsumerList, getBloodAvailability } = require("../Controllers/hospitalController");
const router = express.Router();

router.get(
  "/get-bloodgroup-data",
  authMiddelware,
  getOrgBloodStock
);

router.post("/create-inventory", authMiddelware, createHospitalInventory);
router.post("/consumer-list", authMiddelware, getConsumerList);
router.post("/blood-availability", authMiddelware, getBloodAvailability);


module.exports = router;