const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["admin", "organisation", "donar", "hospital"],
    },
    name: {
      type: String,
      required: function () {
        return this.role === "admin" || this.role === "donar";
      },
    },
    bloodGroup: {
      type: String,
      required: function () {
        return this.role === "donar";
      },
    },
    organisationName: {
      type: String,
      required: function () {
        return this.role === "organisation";
      },
    },
    hospitalName: {
      type: String,
      required: function () {
        return this.role === "hospital";
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model("users", userSchema);

