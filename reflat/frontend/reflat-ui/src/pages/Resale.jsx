import React from "react";
import ListingIntake from "../components/ListingIntake";
// import { FIREBASE_FUNCTIONS_URL } from "../constants";

export default function Resale() {
  // const extractUrl = `${FIREBASE_FUNCTIONS_URL}/extract-listing`;
  // const submitUrl  = `${FIREBASE_FUNCTIONS_URL}/create-listing`;
  return (
    <div>
      <h2>Resale</h2>
      <ListingIntake
        mode="resale"
        // extractUrl={extractUrl}
        // submitUrl={submitUrl}
      />
    </div>
  );
}
