const express = require("express");
const authMiddelware = require("../middlewares/authMiddleware");
const {
  getDonarsListController,
  getHospitalListController,
  getOrgListController,
  deleteDonarController,
  getConsumerController,
  getAnalytics,
} = require("../Controllers/adminControllers");

const adminMiddleware = require("../middlewares/adminMiddleware");
const router = express.Router();

router.get(
  "/donar-list",
  authMiddelware,
  adminMiddleware,
  getDonarsListController
);


router.get("/hospital-list", authMiddelware, getHospitalListController);

router.get("/org-list", authMiddelware, adminMiddleware, getOrgListController);


router.get("/get-analytics", authMiddelware, adminMiddleware, getAnalytics);

router.delete(
  "/delete-user/:id",
  authMiddelware,
  adminMiddleware,
  deleteDonarController
);

module.exports = router;
