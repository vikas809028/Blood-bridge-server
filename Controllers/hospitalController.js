const userInventoryModel = require("../models/userInventoryModel");
const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const userModel = require("../models/userModel");
const { default: mongoose } = require("mongoose");

const getOrgBloodStock = async (req, res) => {
  try {
    // 1. Total blood added to org via userInventory ("in")
    const addedToOrg = await userInventoryModel.aggregate([
      {
        $match: {
          inventoryType: "in",
          organisation: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            organisation: "$organisation",
            bloodGroup: "$bloodGroup",
          },
          totalIn: { $sum: "$quantity" },
        },
      },
    ]);

    // 2. Total blood removed from org via hospitalInventory ("in")
    const removedFromOrg = await hospitalInventoryModel.aggregate([
      {
        $match: {
          inventoryType: "in",
          organisation: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            organisation: "$organisation",
            bloodGroup: "$bloodGroup",
          },
          totalOut: { $sum: "$quantity" },
        },
      },
    ]);

    const stockMap = new Map();

    addedToOrg.forEach((item) => {
      const key = `${item._id.organisation}_${item._id.bloodGroup}`;
      stockMap.set(key, {
        organisation: item._id.organisation,
        bloodGroup: item._id.bloodGroup,
        quantity: item.totalIn,
      });
    });

    removedFromOrg.forEach((item) => {
      const key = `${item._id.organisation}_${item._id.bloodGroup}`;
      if (stockMap.has(key)) {
        stockMap.get(key).quantity -= item.totalOut;
      } else {
        stockMap.set(key, {
          organisation: item._id.organisation,
          bloodGroup: item._id.bloodGroup,
          quantity: -item.totalOut,
        });
      }
    });

    const orgWiseData = {};
    for (let { organisation, bloodGroup, quantity } of stockMap.values()) {
      if (quantity <= 0) continue;

      if (!orgWiseData[organisation]) {
        orgWiseData[organisation] = [];
      }
      orgWiseData[organisation].push({ bloodGroup, quantity });
    }

    const finalData = await Promise.all(
      Object.entries(orgWiseData).map(async ([orgId, bloodData]) => {
        const org = await userModel.findById(orgId);
        if (!org) return null;
        return {
          organisationId: orgId,
          organisationName: org.organisationName,
          bloodData,
        };
      })
    );

    const filteredData = finalData.filter((item) => item !== null);

    return res.status(200).send({
      success: true,
      message: "Organisation blood stock summary",
      data: filteredData,
    });
  } catch (error) {
    console.error("getOrgBloodStock error:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

const createHospitalInventory = async (req, res) => {
  try {
    const { hospitalId, organisationId, bloodGroup, quantity } = req.body;

    if (!hospitalId || !organisationId || !bloodGroup || !quantity) {
      return res.status(400).send({
        success: false,
        message:
          "All fields are required: hospitalId, organisationId, bloodGroup, quantity",
      });
    }

    const qty = parseInt(quantity);
    const hospital = await userModel.findById(hospitalId);
    const organisation = await userModel.findById(organisationId);

    if (!hospital || !organisation) {
      return res.status(404).send({
        success: false,
        message: "Hospital or Organisation not found",
      });
    }

    if (hospital.role !== "hospital" || organisation.role !== "organisation") {
      return res.status(400).send({
        success: false,
        message:
          "Invalid roles. Only hospitals can take blood from organisations.",
      });
    }

    // ✅ Calculate available stock from organisation (userInventory)
    const [inRecord] = await userInventoryModel.aggregate([
      {
        $match: {
          organisation: organisation._id,
          inventoryType: "in",
          bloodGroup,
        },
      },
      {
        $group: {
          _id: null,
          totalIn: { $sum: "$quantity" },
        },
      },
    ]);

    const [outRecord] = await userInventoryModel.aggregate([
      {
        $match: {
          organisation: organisation._id,
          inventoryType: "out",
          bloodGroup,
        },
      },
      {
        $group: {
          _id: null,
          totalOut: { $sum: "$quantity" },
        },
      },
    ]);

    const totalIn = inRecord?.totalIn || 0;
    const totalOut = outRecord?.totalOut || 0;
    const available = totalIn - totalOut;

    if (available < qty) {
      return res.status(400).send({
        success: false,
        message: `Only ${available} units available for ${bloodGroup}`,
      });
    }

    // ✅ Create only 'in' record in hospital inventory
    const hospitalInventory = new hospitalInventoryModel({
      inventoryType: "in",
      hospital: hospital._id,
      email: hospital.email,
      organisation: organisation._id,
      bloodGroup,
      quantity: qty,
    });
    await hospitalInventory.save();

    res.status(201).send({
      success: true,
      message:
        "Blood transferred from organisation to hospital and stored in hospital inventory",
      hospitalInventory,
    });
  } catch (error) {
    console.error("Error in createHospitalInventory:", error);
    res.status(500).send({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getConsumerList = async (req, res) => {
  try {
    const { id } = req.body; // Hospital ID

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Hospital ID is required",
      });
    }

    // Find all "out" records for this hospital
    const records = await userInventoryModel
      .find({
        hospital: id,
        inventoryType: "out",
      })
      .sort({ createdAt: -1 });

    // Enrich records with donor and organization details
    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const donorDetails = await userModel
          .findById(record.user)
          .select("name email phone");

        const organisationDetails = record.organisation
          ? await userModel
              .findById(record.organisation)
              .select("organisationName")
          : null;

        return {
          ...record._doc,
          donorDetails,
          organisationDetails,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Consumer list fetched successfully",
      data: enrichedRecords,
    });
  } catch (error) {
    console.error("Error in getConsumerList:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching consumer list",
      error: error.message,
    });
  }
};

const getBloodAvailability = async (req, res) => {
  try {
    const { id } = req.body; // Hospital ID

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Hospital ID is required",
      });
    }

    // Verify hospital exists
    const hospital = await userModel.findById(id);
    if (!hospital || hospital.role !== "hospital") {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    // All possible blood groups
    const bloodGroups = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

    // Calculate availability for each blood group
    const availability = await Promise.all(
      bloodGroups.map(async (bloodGroup) => {
        // Blood received by hospital
        const received = await hospitalInventoryModel.aggregate([
          {
            $match: {
              hospital: new mongoose.Types.ObjectId(id),
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

        // Blood given out by hospital
        const given = await userInventoryModel.aggregate([
          {
            $match: {
              hospital: new mongoose.Types.ObjectId(id),
              bloodGroup,
              inventoryType: "out",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$quantity" },
            },
          },
        ]);

        const totalReceived = received[0]?.total || 0;
        const totalGiven = given[0]?.total || 0;
        const available = totalReceived - totalGiven;

        return {
          bloodGroup,
          totalReceived,
          totalGiven,
          available,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Blood availability fetched successfully",
      data: {
        hospitalName: hospital.hospitalName,
        availability,
      },
    });
  } catch (error) {
    console.error("Error in getBloodAvailability:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching blood availability",
      error: error.message,
    });
  }
};

module.exports = { getOrgBloodStock, createHospitalInventory, getConsumerList,getBloodAvailability };
