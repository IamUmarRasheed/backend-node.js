// Import necessary modules and dependencies
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

// Function to generate access and refresh tokens for a given user ID
const generateAccessAndRefereshTokens = async (userId) => {
  try {
    // Find the user by ID
    const user = await User.findById(userId);

    // Handle case where the user does not exist
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Generate access and refresh tokens for the user
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Update the user's refresh token in the database
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Return the generated tokens
    return { accessToken, refreshToken };
  } catch (error) {
    // Handle any errors during token generation
    throw new ApiError(500, "Error generating refresh and access tokens");
  }
};

// Controller function to handle user registration
const registerUser = asyncHandler(async (req, res) => {
  // Extract user details from the request body
  const { fullName, email, username, password } = req.body;

  // Validate that all required fields are provided
  if (
    [fullName, email, username, password].some((field) => field?.trim() == "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if a user with the same username or email already exists
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with email or username already registered");
  }

  // Validate and get avatar and cover image file paths from the request files
  const avatarFiles = req.files?.avatar;
  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // Validate that an avatar file is provided
  if (!avatarFiles || avatarFiles.length === 0) {
    throw new ApiError(400, "Avatar file is required");
  }

  // Upload avatar and cover image to Cloudinary
  const avatar = await uploadOnCloudinary(avatarFiles[0].path);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Validate that the avatar upload was successful
  if (!avatar) {
    throw new ApiError(400, "Avatar file upload failed");
  }

  // Create a new user in the database
  const user = await User.create({
    fullName,
    avatar: avatar?.url || "",
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // Retrieve the created user (excluding sensitive information)
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Handle any errors during user creation
  if (!createdUser) {
    throw new ApiError(500, "Error registering the user");
  }

  // Return a success response with the created user
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

// Controller function to handle user login
const loginuser = asyncHandler(async (req, res) => {
  // Extract login credentials from the request body
  const { username, email, password } = req.body;

  // Validate that either username or email is provided
  if (!(username || email)) {
    throw new ApiError(400, "Username or email is required");
  }

  // Find the user by username or email
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  // Handle case where the user does not exist
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check if the provided password is correct
  const isPasswordValid = await user.isPassWordCorrect(password);

  // Handle case where the password is invalid
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // Generate access and refresh tokens for the user
  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  // Retrieve the logged-in user (excluding sensitive information)
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Configure options for setting cookies
  const options = {
    httpOnly: true,
    secure: true,
  };

  // Set cookies with access and refresh tokens in the response
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

// Controller function to handle user logout
const logOutUser = asyncHandler(async (req, res) => {
  // Update the user's refresh token to undefined
  await User.findByIdAndUpdate(
    req.user._id,
    {
      set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  // Configure options for clearing cookies
  const options = {
    httpOnly: true,
    secure: true,
  };

  // Clear cookies containing access and refresh tokens
  return res
    .status(200)
    .cookie("accessToken", options)
    .cookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logout successfuly"));
});

// Controller function to refresh access token using a valid refresh token
const refreshAccessToken = asyncHandler(async (req, res) => {
  // Extract refresh token from cookies or request body
  const incomingRefreshToken =
    (await req.cookies.refreshToken) || req.body.refreshToken;

  // Validate that a refresh token is provided
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    // Verify the incoming refresh token using the secret key
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // Find the user based on the decoded token
    const user = await User.findById(decodedToken?._id);

    // Handle case where the user does not exist
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    // Ensure that the incoming refresh token matches the stored refresh token
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // Configure options for setting cookies
    const options = {
      httpOnly: true,
      secure: true,
    };

    // Generate a new pair of access and refresh tokens
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    // Set cookies with the new access and refresh tokens in the response
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    // Handle any errors during token verification or generation
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

// Export the relevant controller functions
export { registerUser, loginuser, logOutUser, refreshAccessToken };
