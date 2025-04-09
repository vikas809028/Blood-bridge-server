const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const userInventoryModel = require("../models/userInventoryModel");
const userModel = require("../models/userModel");
const nodemailer = require('nodemailer');



const getRecord = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send({
        success: false,
        message: "Donor ID is required",
      });
    }

    // Only find records with inventoryType "in"
    const records = await userInventoryModel
      .find({ 
        user: id,
        inventoryType: "in"  // This filter ensures only "in" records are returned
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
          recordType: "Donation" // Since we're only returning "in" records
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
      error: error.message
    });
  }
};
  
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, 
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  }
});

const createInventory = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    let { userId, inventoryType, bloodGroup, quantity, organisation } = req.body;
    quantity = parseInt(quantity);

    // Validate required fields
    if (!userId || !inventoryType || !bloodGroup || !quantity || !organisation) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Fetch users
    const [user, orgUser] = await Promise.all([
      userModel.findById(userId),
      userModel.findById(organisation)
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
    } else if (inventoryType === "out") {
      if (user.role !== "hospital" || orgUser.role !== "organisation") {
        return res.status(400).json({
          success: false,
          message: "Only hospitals can take from organisations",
        });
      }

      // Check available stock
      const [inRecord, outRecord] = await Promise.all([
        userInventoryModel.aggregate([
          { $match: { organisation: orgUser._id, inventoryType: "in", bloodGroup } },
          { $group: { _id: null, totalIn: { $sum: "$quantity" } } }
        ]),
        userInventoryModel.aggregate([
          { $match: { organisation: orgUser._id, inventoryType: "out", bloodGroup } },
          { $group: { _id: null, totalOut: { $sum: "$quantity" } } }
        ])
      ]);

      const available = (inRecord[0]?.totalIn || 0) - (outRecord[0]?.totalOut || 0);
      if (available < quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${available} units available for ${bloodGroup}`,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory type",
      });
    }

    // Create Inventory Record
    const inventory = await userInventoryModel.create({
      user: user._id,
      email: user.email,
      inventoryType,
      bloodGroup,
      quantity,
      organisation: orgUser._id,
    });

    // Send emails only for donations (inventoryType === "in")
    if (inventoryType === "in") {
      try {
        const donationDate = new Date().toLocaleString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        // Email to Donor
        await transporter.sendMail({
          from: `"Blood Bridge" <${process.env.SMTP_FROM_EMAIL}>`,
          to: user.email,
          subject: "Thank You for Your Blood Donation",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #e74c3c;">Dear ${user.name},</h2>
              <p>Thank you for your generous donation of <strong>${quantity} unit(s) of ${bloodGroup}</strong> blood.</p>
              <p>Your contribution will help save lives at <strong>${orgUser.organisationName}</strong>.</p>
              <p><strong>Donation Details:</strong></p>
              <ul>
                <li>Organization: ${orgUser.organisationName}</li>
                <li>Date: ${donationDate}</li>
                <li>Blood Group: ${bloodGroup}</li>
                <li>Quantity: ${quantity} unit(s)</li>
              </ul>
              <p>If you have any questions, please contact the organization directly at ${orgUser.email} or ${orgUser.phone}.</p>
              <p style="margin-top: 30px;">With gratitude,</p>
              <p><strong>The Blood Bridge Team</strong></p>
              <p style="font-size: 12px; color: #777;">This is an automated message. Please do not reply directly to this email.</p>
            </div>
          `
        });

        // Email to Organization
        await transporter.sendMail({
          from: `"Blood Bridge" <${process.env.SMTP_FROM_EMAIL}>`,
          to: orgUser.email,
          subject: `New Blood Donation Received - ${bloodGroup}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #e74c3c;">New Blood Donation Received</h2>
              <p>You have received <strong>${quantity} unit(s) of ${bloodGroup}</strong> blood:</p>
              <p><strong>Donor Details:</strong></p>
              <ul>
                <li>Name: ${user.name}</li>
                <li>Email: ${user.email}</li>
                <li>Phone: ${user.phone || 'Not provided'}</li>
                <li>Date: ${donationDate}</li>
                <li>Blood Group: ${bloodGroup}</li>
                <li>Quantity: ${quantity} unit(s)</li>
              </ul>
              <p>This donation has been automatically recorded in your inventory.</p>
              <p style="margin-top: 30px;">Best regards,</p>
              <p><strong>The Blood Bridge Team</strong></p>
            </div>
          `
        });

        console.log("Successfully sent donation confirmation emails");
      } catch (emailError) {
        console.error("Failed to send emails:", emailError);
        // Continue even if email fails
      }
    }

    return res.status(201).json({
      success: true,
      message: "Inventory record created successfully",
      data: inventory
    });

  } catch (error) {
    console.error("Error in createInventory:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    // Step 1: Get all hospitals (from users collection with role=hospital)
    const hospitals = await userModel.find(
      { role: 'hospital' },
      { _id: 1, hospitalName: 1 }
    );

    // Step 2: Get all hospital inventory data (both in and out)
    const hospitalInventory = await hospitalInventoryModel.aggregate([
      {
        $group: {
          _id: {
            hospital: "$hospital",
            bloodGroup: "$bloodGroup",
            type: "$inventoryType" // 'in' or 'out'
          },
          total: { $sum: "$quantity" }
        }
      }
    ]);

    // Step 3: Get all blood given by hospitals to users
    const bloodGivenToUsers = await userInventoryModel.aggregate([
      {
        $match: { 
          inventoryType: "out", // Hospital gave blood to user
          hospital: { $exists: true } // Ensure hospital field exists
        }
      },
      {
        $group: {
          _id: {
            hospital: "$hospital",
            bloodGroup: "$bloodGroup"
          },
          total: { $sum: "$quantity" }
        }
      }
    ]);

    // Step 4: Process data for response
    const bloodGroups = ["O+", "O-", "AB+", "AB-", "A+", "A-", "B+", "B-"];
    const hospitalBloodData = hospitals.map(hospital => {
      const hospitalData = {
        hospitalId: hospital._id,
        hospitalName: hospital.hospitalName,
        bloodGroups: {}
      };

      // Initialize all blood groups
      bloodGroups.forEach(bg => {
        hospitalData.bloodGroups[bg] = {
          received: 0,    // From HospitalInventory (type: 'in')
          givenToUsers: 0, // From UserInventory (type: 'out')
          available: 0     // received - givenToUsers
        };
      });

      // Calculate blood received by hospital (HospitalInventory 'in')
      hospitalInventory.forEach(record => {
        if (record._id.hospital.equals(hospital._id)) {
          if (record._id.type === 'in') {
            hospitalData.bloodGroups[record._id.bloodGroup].received += record.total;
          }
        }
      });

      // Calculate blood given to users (UserInventory 'out')
      bloodGivenToUsers.forEach(record => {
        if (record._id.hospital.equals(hospital._id)) {
          hospitalData.bloodGroups[record._id.bloodGroup].givenToUsers += record.total;
        }
      });

      // Calculate available blood
      bloodGroups.forEach(bg => {
        hospitalData.bloodGroups[bg].available = 
          hospitalData.bloodGroups[bg].received - 
          hospitalData.bloodGroups[bg].givenToUsers;
      });

      return hospitalData;
    });

    return res.status(200).send({
      success: true,
      message: "Hospital blood availability data fetched successfully",
      data: hospitalBloodData
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({
      success: false,
      message: "Error fetching hospital blood availability",
      error: error.message
    });
  }
};



module.exports = {
  getRecord,
  createInventory,
  getOrgListController,
  getHospitalListController,
  getHospitalAvailableBlood
};
