const mongoose = require("mongoose");
const userInventoryModel = require("../models/userInventoryModel");
const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const userModel = require("../models/userModel");


const getDonorsByOrganisation = async (req, res) => {
    try {
      const { id } = req.body; // Organization ID from request body
  
      // Verify the organization exists
      const organisation = await userModel.findOne({
        _id: new mongoose.Types.ObjectId(id),
        role: 'organisation'
      });
  
      if (!organisation) {
        return res.status(404).send({
          success: false,
          message: "Organization not found"
        });
      }

      // Debug: Check raw records
      const testRecords = await userInventoryModel.find({
        organisation: id,
        inventoryType: "in"
      });
      console.log(`Found ${testRecords.length} raw inventory records`);
      
      // Find all donors who have donated to this organization
      const donors = await userInventoryModel.aggregate([
        {
          $match: {
            organisation: new mongoose.Types.ObjectId(id),
            inventoryType: "in"
          }
        },
        {
          $lookup: {
            from: "users", // Ensure this matches your actual collection name
            localField: "user",
            foreignField: "_id",
            as: "donorDetails"
          }
        },
        {
          $unwind: "$donorDetails"
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
            donatedAt: "$createdAt"
          }
        },
        {
          $sort: { donatedAt: -1 }
        }
      ]);

      console.log(`Processed ${donors.length} donor records`);
  
      return res.status(200).send({
        success: true,
        message: "Donors fetched successfully",
        organisationName: organisation.organisationName,
        count: donors.length,
        data: donors
      });
    } catch (error) {
      console.error("Detailed error:", error);
      return res.status(500).send({
        success: false,
        message: "Error while fetching donors",
        error: error.message
      });
    }
};


// 1. Get Hospitals That Received Blood (Consumers)
const getHospitalConsumers = async (req, res) => {
  try {
    const { id } = req.body; // Organization ID

  
    const organisation = await userModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      role: 'organisation'
    });

    if (!organisation) {
      return res.status(404).send({
        success: false,
        message: "Organization not found"
      });
    }

    // Find all hospitals that received blood from this organization
    const consumers = await hospitalInventoryModel.aggregate([
      {
        $match: {
          organisation: new mongoose.Types.ObjectId(id),
          inventoryType: "in" // Hospital received blood
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "hospital",
          foreignField: "_id",
          as: "hospitalDetails"
        }
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
              receivedAt: "$createdAt"
            }
          }
        }
      },
      {
        $project: {
          hospitalId: "$_id",
          hospitalName: 1,
          totalBloodReceived: 1,
          bloodGroups: 1,
          _id: 0
        }
      }
    ]);

    return res.status(200).send({
      success: true,
      message: "Hospital consumers fetched successfully",
      organisationName: organisation.organisationName,
      count: consumers.length,
      data: consumers
    });
  } catch (error) {
    console.error("Error in getHospitalConsumers:", error);
    return res.status(500).send({
      success: false,
      message: "Error while fetching hospital consumers",
      error: error.message
    });
  }
};


const getOrganizationBloodAvailability = async (req, res) => {
    try {
      const { id } = req.body; // Organization ID
  
      // Verify organization exists
      const organization = await userModel.findOne({
        _id: new mongoose.Types.ObjectId(id),
        role: 'organisation'
      });
  
      if (!organization) {
        return res.status(404).send({
          success: false,
          message: "Organization not found"
        });
      }
  
      // Calculate blood availability
      const bloodGroups = ["O+", "O-", "AB+", "AB-", "A+", "A-", "B+", "B-"];
      const availability = [];
  
      for (const bloodGroup of bloodGroups) {
        // Blood received by organization (from donors)
        const receivedFromDonors = await userInventoryModel.aggregate([
          {
            $match: {
              organisation: new mongoose.Types.ObjectId(id),
              bloodGroup,
              inventoryType: "in" // Blood coming into organization
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$quantity" }
            }
          }
        ]);
  
        // Blood given to hospitals by organization
        const givenToHospitals = await hospitalInventoryModel.aggregate([
          {
            $match: {
              organisation: new mongoose.Types.ObjectId(id),
              bloodGroup,
              inventoryType: "in" // Hospital received (which means organization gave)
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$quantity" }
            }
          }
        ]);
  
        const totalReceived = receivedFromDonors[0]?.total || 0;
        const totalGiven = givenToHospitals[0]?.total || 0;
        const available = totalReceived - totalGiven;
  
        availability.push({
          bloodGroup,
          totalReceived,
          totalGiven,
          available
        });
      }
  
      return res.status(200).send({
        success: true,
        message: "Organization blood availability fetched successfully",
        organizationName: organization.organisationName,
        data: availability
      });
    } catch (error) {
      console.error("Error in getOrganizationBloodAvailability:", error);
      return res.status(500).send({
        success: false,
        message: "Error while fetching organization blood availability",
        error: error.message
      });
    }
  };
module.exports = { 
  getDonorsByOrganisation,
  getHospitalConsumers,
  getOrganizationBloodAvailability
};