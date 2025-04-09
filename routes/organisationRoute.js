const express = require("express");
const authMiddelware = require("../middlewares/authMiddleware");
const { getDonorsByOrganisation, getOrganizationBloodAvailability, getHospitalConsumers } = require("../Controllers/organisationController");
const router = express.Router();


router.post('/get-donar',authMiddelware, getDonorsByOrganisation);
router.post('/get-consumer',authMiddelware, getHospitalConsumers);
router.post('/get-analytics',authMiddelware, getOrganizationBloodAvailability);
  
module.exports = router;