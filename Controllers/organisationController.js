const mongoose = require("mongoose");
const userInventoryModel = require("../models/userInventoryModel");
const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const userModel = require("../models/userModel");
const orgInventoryModel = require("../models/orgInventoryModel");
const { sendEmail } = require("../utils/sendMail");

const getDonors = async (req, res) => {
  try {
    const { id } = req.body;

    const organisation = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: "organisation",
    });

    if (!organisation) {
      return res.status(404).send({
        success: false,
        message: "Organization not found",
      });
    }

    // Find unique donors who have donated to this organization
    const donors = await userInventoryModel.aggregate([
      {
        $match: {
          organisation: new mongoose.Types.ObjectId(id),
          inventoryType: "out",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "donorDetails",
        },
      },
      {
        $unwind: "$donorDetails",
      },
      {
        $group: {
          _id: "$user", // Group by donor ID
          name: { $first: "$donorDetails.name" },
          email: { $first: "$donorDetails.email" },
          phone: { $first: "$donorDetails.phone" },
          address: { $first: "$donorDetails.address" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          address: 1,
        },
      },
    ]);

    return res.status(200).send({
      success: true,
      message: "Donors fetched successfully",
      organisationName: organisation.organisationName,
      count: donors.length,
      data: donors,
    });
  } catch (error) {
    console.error("Error fetching donors:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching donors",
      error: error.message,
    });
  }
};

const getPendingDonations = async (req, res) => {
  try {
    const { id } = req.body;

    // Verify organization exists
    const organisation = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: "organisation",
    });

    if (!organisation) {
      return res.status(404).send({
        success: false,
        message: "Organization not found",
      });
    }

    // Get all pending donations and link them properly
    const donations = await userInventoryModel.aggregate([
      {
        $match: {
          organisation: new mongoose.Types.ObjectId(id),
          inventoryType: "out",
          isCollectedByorg: false,
        },
      },
      {
        $lookup: {
          from: "orginventories",
          let: {
            userId: "$user",
            bloodGroup: "$bloodGroup",
            donatedAt: "$createdAt",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$user", "$$userId"] },
                    { $eq: ["$bloodGroup", "$$bloodGroup"] },
                    { $eq: ["$inventoryType", "in"] },
                    { $eq: ["$isRecieved", false] },
                    {
                      $gte: [
                        "$createdAt",
                        { $subtract: ["$$donatedAt", 1000 * 60 * 5] }, // 5 minute window
                      ],
                    },
                    {
                      $lte: [
                        "$createdAt",
                        { $add: ["$$donatedAt", 1000 * 60 * 5] }, // 5 minute window
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "orgInventory",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "donorDetails",
        },
      },
      {
        $unwind: "$donorDetails",
      },
      {
        $addFields: {
          orgInventoryId: {
            $ifNull: [{ $arrayElemAt: ["$orgInventory._id", 0] }, null],
          },
        },
      },
      {
        $project: {
          _id: 1,
          userInventoryId: "$_id",
          orgInventoryId: 1,
          name: "$donorDetails.name",
          email: "$donorDetails.email",
          phone: "$donorDetails.phone",
          address: "$donorDetails.address",
          bloodGroup: 1,
          quantity: 1,
          donatedAt: "$createdAt",
          inventoryType: "out",
        },
      },
    ]);

    return res.status(200).send({
      success: true,
      message: "Pending donations fetched successfully",
      organisationName: organisation.organisationName,
      count: donations.length,
      data: donations,
    });
  } catch (error) {
    console.error("Error in getPendingDonations:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching pending donations",
      error: error.message,
    });
  }
};

const getDonations = async (req, res) => {
  try {
    const { id } = req.body;

    const organisation = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: "organisation",
    });

    if (!organisation) {
      return res.status(404).send({
        success: false,
        message: "Organization not found",
      });
    }

    // Find all donors who have donated to this organization
    const donors = await userInventoryModel.aggregate([
      {
        $match: {
          organisation: new mongoose.Types.ObjectId(id),
          inventoryType: "out",
          isCollectedByorg: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "donorDetails",
        },
      },
      {
        $unwind: "$donorDetails",
      },
      {
        $project: {
          _id: "$donorDetails._id",
          name: "$donorDetails.name",
          email: "$donorDetails.email",
          phone: "$donorDetails.phone",
          address: "$donorDetails.address",
          bloodGroup: 1,
          quantity: 1,
          donatedAt: "$createdAt",
        },
      },
      {
        $sort: { donatedAt: -1 },
      },
    ]);

    return res.status(200).send({
      success: true,
      message: "Donors fetched successfully",
      organisationName: organisation.organisationName,
      count: donors.length,
      data: donors,
    });
  } catch (error) {
    console.error("Detailed error:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching donors",
      error: error.message,
    });
  }
};

const getHospitalConsumers = async (req, res) => {
  try {
    const { id } = req.body; // Organization ID

    const organisation = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: "organisation",
    });

    if (!organisation) {
      return res.status(404).send({
        success: false,
        message: "Organization not found",
      });
    }

    // Find all hospitals that received blood from this organization
    const consumers = await hospitalInventoryModel.aggregate([
      {
        $match: {
          organisation: new mongoose.Types.ObjectId(id),
          inventoryType: "in", // Hospital received blood
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "hospital",
          foreignField: "_id",
          as: "hospitalDetails",
        },
      },
      { $unwind: "$hospitalDetails" },
      {
        $group: {
          _id: "$hospital",
          hospitalName: { $first: "$hospitalDetails.hospitalName" },
          totalBloodReceived: { $sum: "$quantity" },
          bloodGroups: {
            $push: {
              bloodGroup: "$bloodGroup",
              quantity: "$quantity",
              receivedAt: "$createdAt",
            },
          },
        },
      },
      {
        $project: {
          hospitalId: "$_id",
          hospitalName: 1,
          totalBloodReceived: 1,
          bloodGroups: 1,
          _id: 0,
        },
      },
    ]);

    return res.status(200).send({
      success: true,
      message: "Hospital consumers fetched successfully",
      organisationName: organisation.organisationName,
      count: consumers.length,
      data: consumers,
    });
  } catch (error) {
    console.error("Error in getHospitalConsumers:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching hospital consumers",
      error: error.message,
    });
  }
};

const getOrganizationBloodAvailability = async (req, res) => {
  try {
    const { id } = req.body; // Organization ID

    // Verify organization exists
    const organization = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: "organisation",
    });

    if (!organization) {
      return res.status(404).send({
        success: false,
        message: "Organization not found",
      });
    }

    // Calculate blood availability
    const bloodGroups = ["O+", "O-", "AB+", "AB-", "A+", "A-", "B+", "B-"];
    const availability = [];

    for (const bloodGroup of bloodGroups) {
      // Blood received by organization (from donors)
      const receivedFromDonors = await orgInventoryModel.aggregate([
        {
          $match: {
            organisation: new mongoose.Types.ObjectId(id),
            bloodGroup,
            inventoryType: "in",
            isRecieved: true,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$quantity" },
          },
        },
      ]);

      const givenToHospitals = await hospitalInventoryModel.aggregate([
        {
          $match: {
            organisation: new mongoose.Types.ObjectId(id),
            bloodGroup,
            inventoryType: "in",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$quantity" },
          },
        },
      ]);

      const totalReceived = receivedFromDonors[0]?.total || 0;
      const totalGiven = givenToHospitals[0]?.total || 0;
      const available = totalReceived - totalGiven;

      availability.push({
        bloodGroup,
        totalReceived,
        totalGiven,
        available,
      });
    }

    return res.status(200).send({
      success: true,
      message: "Organization blood availability fetched successfully",
      organizationName: organization.organisationName,
      data: availability,
    });
  } catch (error) {
    console.error("Error in getOrganizationBloodAvailability:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching organization blood availability",
      error: error.message,
    });
  }
};

const collectBlood = async (req, res) => {
  try {
    const { orgInventoryId, userInventoryId, collectionDateTime } = req.body;

    // Find both records in parallel
    const [orgDonation, userDonation] = await Promise.all([
      orgInventoryId ? orgInventoryModel.findById(orgInventoryId) : null,
      userInventoryId ? userInventoryModel.findById(userInventoryId) : null,
    ]);

    // Check if at least one record exists
    if (!orgDonation && !userDonation) {
      return res.status(404).send({
        success: false,
        message: "No donation records found",
      });
    }

    // Check status of found records
    if (orgDonation && orgDonation.isRecieved) {
      return res.status(400).send({
        success: false,
        message: "Organization inventory already received",
      });
    }

    if (userDonation && userDonation.isCollectedByorg) {
      return res.status(400).send({
        success: false,
        message: "User inventory already collected",
      });
    }

    // Format the date and time
    const formattedDate = new Date(collectionDateTime).toLocaleString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    await sendEmail(
      userDonation.email,
      "Blood Donation Collection Confirmation 🩸",
      `
    <h2>Dear ${userDonation.name || "Donor"},</h2>
    <p>Thank you for your generous blood donation of <strong>${
      userDonation.quantity
    } unit(s)</strong> of <strong>${userDonation.bloodGroup}</strong> blood.</p>
    <p>We're pleased to inform you that your donation will be been received by <strong>${
      orgDonation?.organisationName || "the organization"
    }</strong>.</p>
    
    <h3>Collection Details:</h3>
    <p><strong>Date & Time:</strong> ${formattedDate}</p>
    <p><strong>Blood Group:</strong> ${userDonation.bloodGroup}</p>
    <p><strong>Quantity:</strong> ${userDonation.quantity} ml</p>
    
    <br/>
    <p style="font-style: italic;">Your contribution is helping save lives. Thank you for being a hero! ❤️</p>
    <p>— Team Blood Bridge</p>
  `
    );

    // Update found records
    const updatePromises = [];
    if (orgDonation) {
      updatePromises.push(
        orgInventoryModel.findByIdAndUpdate(orgInventoryId, {
          isRecieved: true,
        })
      );
    }

    if (userDonation) {
      updatePromises.push(
        userInventoryModel.findByIdAndUpdate(userInventoryId, {
          isCollectedByorg: true,
        })
      );
    }

    await Promise.all(updatePromises);

    return res.status(200).send({
      success: true,
      message: "Blood collected successfully",
    });
  } catch (error) {
    console.error("Error in collectBlood:", error);
    return res.status(500).send({
      success: false,
      message: "Error collecting blood",
      error: error.message,
    });
  }
};

module.exports = {
  getDonors,
  getHospitalConsumers,
  getOrganizationBloodAvailability,
  getPendingDonations,
  getDonations,
  collectBlood,
};
