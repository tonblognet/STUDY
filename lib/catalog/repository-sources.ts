import { directoryDetails } from "@/lib/university-directory-details";
import {
  registerDirectorySources,
  summarizeDirectorySources,
} from "./directory-sources";

/**
 * Side-effect module for scripts and tests: registers the reviewed directory
 * sources computed straight from the repository evidence. Runtime pages read
 * the generated summary instead and must not import this module.
 */
registerDirectorySources(summarizeDirectorySources(directoryDetails));
