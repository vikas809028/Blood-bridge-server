const express = require("express");
const authMiddelware = require("../middlewares/authMiddleware");
const { getRecord, createInventory, getOrgListController, getHospitalListController, getHospitalAvailableBlood } = require("../Controllers/donorController");
const router = express.Router();

router.post(
  "/get-record",
  authMiddelware,
  getRecord
);

router.post("/create-inventory", authMiddelware, createInventory);

router.get("/organization-list", authMiddelware,getOrgListController);

router.get("/hospitals-blooddata", authMiddelware,getHospitalAvailableBlood);

router.get(
  "/hospital-list",
  authMiddelware,
  getHospitalListController
);


module.exports = router;