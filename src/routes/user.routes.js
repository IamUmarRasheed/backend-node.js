import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { logOutUser, loginuser, refreshAccessToken, registerUser } from "../controllers/user.controller.js";
import { verifyUser } from "../middlewares/auth.middlerware.js";
const router= Router()
router.route('/register').post(
    upload.fields([{
        name:'avatar',
        maxCount:1
    },{
        name:'coverImage',
        maxCount:1
    }
]),registerUser
)
router.route('/login').post(loginuser)
router.route('/logout').post(verifyUser, logOutUser)
router.route("/refresh-token").post(refreshAccessToken);
export default router