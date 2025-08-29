import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: 'asia-south1' }); // Set default region for all functions

admin.initializeApp();

export {api} from "./get_api";
export {extractPropertyDetails, createListing, health} from "./post_api";
