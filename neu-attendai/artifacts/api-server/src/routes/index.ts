import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coursesRouter from "./courses";
import sessionsRouter from "./sessions";
import attendanceRouter from "./attendance";
import settingsRouter from "./settings";
import studentCoursesRouter from "./studentCourses";
import professorCoursesRouter from "./professorCourses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(coursesRouter);
router.use(sessionsRouter);
router.use(attendanceRouter);
router.use(settingsRouter);
router.use(studentCoursesRouter);
router.use(professorCoursesRouter);

export default router;
