const mongoose = require("mongoose");

const hospitalInventorySchema = new mongoose.Schema(
  {
    inventoryType: {
      type: String,
      required: [true, "Inventory type is required"],
      enum: ["in", "out"], // 'in' means hospital received, 'out' means hospital gave
    },
    bloodGroup: {
      type: String,
      required: [true, "Blood group is required"],
      enum: ["O+", "O-", "AB+", "AB-", "A+", "A-", "B+", "B-"],
    },
    quantity: {
      type: Number,
      required: [true, "Blood quantity is required"],
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "Hospital is required"],
    },
    organisation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users", // Only if received from organisation
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users", // Only if donated to user
    },
    email: {
      type: String,
      required: [true, "Hospital email is required"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HospitalInventory", hospitalInventorySchema);
