const express = require("express");
const dotenv = require("dotenv");
const colors = require("colors");
const morgan = require("morgan");
const cors = require("cors");
const connectDB = require("./config/db");
//dot config
dotenv.config();

//mongodb connection
connectDB();

//rest object
const app = express();

//middlewares
app.use(express.json());
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/v1/auth", require("./routes/authRoutes"));
app.use("/api/v1/admin", require("./routes/AdminRoute"));
app.use("/api/v1/donor", require("./routes/donorRoute"));
app.use("/api/v1/hospital", require("./routes/hospitalRoute"));
app.use("/api/v1/organisation", require("./routes/organisationRoute"));
app.use("/api/v1/payment", require("./routes/paymentRoute"));

//port
const PORT = process.env.PORT || 8001;

app.listen(PORT, () => {
  console.log(
    `Node Server Running In ${process.env.DEV_MODE} ModeOn Port ${process.env.PORT}`
      .bgBlue.white
  );
});