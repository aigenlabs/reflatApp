import React from "react";
import ListingIntake from "../components/ListingIntake";

export default function Intake() {
  // Removed mode toggle; ListingIntake now provides its own Mode dropdown.
  return (
    <div>
      <ListingIntake />
    </div>
  );
}
