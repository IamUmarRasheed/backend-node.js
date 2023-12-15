import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,  
      // {useNewUrlParser: true,
      // useUnifiedTopology: true,}
    );
    console.log(
      `the mongodb conntected DB HOST : ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("mongodb connection failed", error);
    process.exit(1);
  }
};
export default connectDB
