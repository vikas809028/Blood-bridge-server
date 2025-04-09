const mongoose = require("mongoose");

const userInventorySchema = new mongoose.Schema(
  {
    inventoryType: {
      type: String,
      required: [true, "Inventory type is required"],
      enum: ["in", "out"], // 'out' means user donated, 'in' means user took blood
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
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: [true, "User is required"],
    },
    organisation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users", // Only if donated to org
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users", // Only if received from hospital
    },
    email: {
      type: String,
      required: [true, "User email is required"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserInventory", userInventorySchema);
