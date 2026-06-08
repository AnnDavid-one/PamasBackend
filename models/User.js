// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true },
  name: String,
  email: { type: String, required: true, unique: true },
  picture: String,
}, { timestamps: true });

export default mongoose.model("User", userSchema);