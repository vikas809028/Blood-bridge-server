const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const orgInventoryModel = require("../models/orgInventoryModel");
const userInventoryModel = require("../models/userInventoryModel");
const userModel = require("../models/userModel");
const nodemailer = require("nodemailer");
const { sendEmail } = require("../utils/sendMail");

const getRecord = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send({
        success: false,
        message: "Donor ID is required",
      });
    }

    const records = await userInventoryModel
      .find({
        user: id,
        inventoryType: "out",
      })
      .sort({ createdAt: -1 });

    const updatedRecords = await Promise.all(
      records.map(async (record) => {
        let organisationName = "Unknown";

        if (record.organisation) {
          const orgUser = await userModel.findById(record.organisation);
          if (orgUser?.role === "organisation") {
            organisationName = orgUser.organisationName;
          }
        }

        return {
          ...record._doc,
          organisation: {
            organisationName,
          },
          recordType: "Donation", // Since we're only returning "in" records
        };
      })
    );

    return res.status(200).send({
      success: true,
      message: "Donation records fetched successfully",
      data: updatedRecords,
    });
  } catch (error) {
    console.error("Error in getRecord:", error);
    return res.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getOrgListController = async (req, res) => {
  try {
    const orgData = await userModel
      .find({ role: "organisation" })
      .sort({ createdAt: -1 });

    return res.status(200).send({
      success: true,
      Toatlcount: orgData.length,
      message: "ORG List Fetched Successfully",
      orgData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Error In ORG List API",
      error,
    });
  }
};

const getHospitalListController = async (req, res) => {
  try {
    const hospitalData = await userModel
      .find({ role: "hospital" })
      .sort({ createdAt: -1 });

    return res.status(200).send({
      success: true,
      Toatlcount: hospitalData.length,
      message: "HOSPITAL List Fetched Successfully",
      hospitalData,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error In Hospital List API",
      error,
    });
  }
};

const getHospitalAvailableBlood = async (req, res) => {
  try {
    const hospitals = await userModel.find(
      { role: "hospital" },
      { _id: 1, hospitalName: 1 }
    );

    const hospitalInventory = await hospitalInventoryModel.aggregate([
      {
        $group: {
          _id: {
            hospital: "$hospital",
            bloodGroup: "$bloodGroup",
            type: "$inventoryType",
          },
          total: { $sum: "$quantity" },
        },
      },
    ]);

    // Step 3: Get all blood given by hospitals to users
    const bloodGivenToUsers = await userInventoryModel.aggregate([
      {
        $match: {
          inventoryType: "in",
          hospital: { $exists: true }, // Ensure hospital field exists
        },
      },
      {
        $group: {
          _id: {
            hospital: "$hospital",
            bloodGroup: "$bloodGroup",
          },
          total: { $sum: "$quantity" },
        },
      },
    ]);

    // Step 4: Process data for response
    const bloodGroups = ["O+", "O-", "AB+", "AB-", "A+", "A-", "B+", "B-"];
    const hospitalBloodData = hospitals.map((hospital) => {
      const hospitalData = {
        hospitalId: hospital._id,
        hospitalName: hospital.hospitalName,
        bloodGroups: {},
      };

      // Initialize all blood groups
      bloodGroups.forEach((bg) => {
        hospitalData.bloodGroups[bg] = {
          received: 0, // From HospitalInventory (type: 'in')
          givenToUsers: 0, // From UserInventory (type: 'out')
          available: 0, // received - givenToUsers
        };
      });

      // Calculate blood received by hospital (HospitalInventory 'in')
      hospitalInventory.forEach((record) => {
        if (record._id.hospital.equals(hospital._id)) {
          if (record._id.type === "in") {
            hospitalData.bloodGroups[record._id.bloodGroup].received +=
              record.total;
          }
        }
      });

      // Calculate blood given to users (UserInventory 'out')
      bloodGivenToUsers.forEach((record) => {
        if (record._id.hospital.equals(hospital._id)) {
          hospitalData.bloodGroups[record._id.bloodGroup].givenToUsers +=
            record.total;
        }
      });

      // Calculate available blood
      bloodGroups.forEach((bg) => {
        hospitalData.bloodGroups[bg].available =
          hospitalData.bloodGroups[bg].received -
          hospitalData.bloodGroups[bg].givenToUsers;
      });

      return hospitalData;
    });

    return res.status(200).send({
      success: true,
      message: "Hospital blood availability data fetched successfully",
      data: hospitalBloodData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({
      success: false,
      message: "Error fetching hospital blood availability",
      error: error.message,
    });
  }
};

const createInventory = async (req, res) => {
  try {
    let { userId, email, inventoryType, bloodGroup, quantity, organisation } =
      req.body;
    quantity = parseInt(quantity);

    if (
      !userId ||
      !inventoryType ||
      !bloodGroup ||
      !quantity ||
      !organisation
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Fetch users
    const [user, orgUser] = await Promise.all([
      userModel.findById(userId),
      userModel.findById(organisation),
    ]);

    if (!user || !orgUser) {
      return res.status(404).json({
        success: false,
        message: "User or Organisation not found",
      });
    }

    // Validate roles based on inventory type
    if (inventoryType === "in") {
      if (user.role !== "donar" || orgUser.role !== "organisation") {
        return res.status(400).json({
          success: false,
          message: "Only donors can donate to organisations",
        });
      }
    }

    const inventoryUser = await userInventoryModel.create({
      user: user._id,
      email: user.email,
      inventoryType: "out",
      bloodGroup,
      quantity,
      organisation: orgUser._id,
      isDonated: true,
      isCollectedByorg: false,
    });

    const inventoryOrg = await orgInventoryModel.create({
      user: user._id,
      email: user.email,
      inventoryType,
      bloodGroup,
      quantity,
      organisation: orgUser._id,
      isRecieved: false,
    });

    // ✅ Send Email to Donor
    await sendEmail(
      user.email,
      "Blood Donation Confirmation 🩸",
      `
        <h2>Dear ${user.name || "Donor"},</h2>
        <p>Thank you for your generous blood donation of <strong>${quantity} unit(s)</strong> of <strong>${bloodGroup}</strong> to <strong>${
        orgUser.name || "an organization"
      }</strong>.</p>
        <p>Your donation is currently pending confirmation.</p>
        <p><strong>Once the organization receives and accepts your blood, you’ll receive a confirmation email from us.</strong></p>
        <br/>
        <p style="font-style: italic;">Together, we are building a stronger bridge of hope and life. ❤️</p>
        <p>— Team Blood Bridge</p>
      `
    );

    return res.status(201).json({
      success: true,
      message: "Inventory record created successfully and email sent",
      data: { inventoryUser, inventoryOrg },
    });
  } catch (error) {
    console.error("Error in createInventory:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getOrders = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send({
        success: false,
        message: "Donor ID is required",
      });
    }

    const records = await userInventoryModel
      .find({
        user: id,
        inventoryType: "in",
      })
      .sort({ createdAt: -1 });


    const updatedRecords = await Promise.all(
      records.map(async (record) => {
        let hospitalName = "Unknown";

        if (record.hospital) {
          const orgUser = await userModel.findById(record.hospital);
          console.log(orgUser);
          
          if (orgUser?.role === "hospital") {
            hospitalName = orgUser.hospitalName;
          }
        }

        return {
          ...record._doc,
          hospital: {
            hospitalName,
          },
          recordType: "Donation", 
        };
      })
    );

    return res.status(200).send({
      success: true,
      message: "Donation records fetched successfully",
      data: updatedRecords,
    });
  } catch (error) {
    console.error("Error in getRecord:", error);
    return res.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getRecord,
  createInventory,
  getOrgListController,
  getHospitalListController,
  getHospitalAvailableBlood,
  getOrders
};
