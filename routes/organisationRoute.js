const express = require("express");
const authMiddelware = require("../middlewares/authMiddleware");
const { getOrganizationBloodAvailability, getHospitalConsumers, getDonors, getPendingDonations, getDonations, collectBlood } = require("../Controllers/organisationController");
const router = express.Router();


router.post('/get-donar',authMiddelware, getDonors);
router.post('/get-donations',authMiddelware, getDonations);
router.post('/get-pending-donations',authMiddelware, getPendingDonations);
router.post('/get-consumer',authMiddelware, getHospitalConsumers);
router.post('/get-analytics',authMiddelware, getOrganizationBloodAvailability);
router.post('/collect-blood',authMiddelware, collectBlood);
  
module.exports = router;