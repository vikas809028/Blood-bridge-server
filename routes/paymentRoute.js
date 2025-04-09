const express = require("express");
const {
    getRazorPay_keyID,
    create_order,
    verify_payment,
    verify_payment_hospital
} = require("../Controllers/paymentControllers");


const router = express.Router();


router.get("/getId", getRazorPay_keyID);
router.post("/create-order", create_order);
router.post("/verify-payment", verify_payment);
router.post("/verify-payment-hospital", verify_payment_hospital);
  
module.exports = router;