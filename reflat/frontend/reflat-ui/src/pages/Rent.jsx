import React from "react";
import ListingIntake from "../components/ListingIntake";
// If you want to use your Firebase Functions base:
// import { FIREBASE_FUNCTIONS_URL } from "../constants";

export default function Rent() {
  // const extractUrl = `${FIREBASE_FUNCTIONS_URL}/extract-listing`;
  // const submitUrl  = `${FIREBASE_FUNCTIONS_URL}/create-listing`;
  return (
    <div>
      <h2>Rent</h2>
      <ListingIntake
        mode="rent"
        // extractUrl={extractUrl}
        // submitUrl={submitUrl}
      />
    </div>
  );
}
