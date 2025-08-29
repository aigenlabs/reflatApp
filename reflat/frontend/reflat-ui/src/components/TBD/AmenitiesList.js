import React from "react";

export default function AmenitiesList({ outdoor, indoor }) {
  return (
    <div className="card">
      <h3>Outdoor Amenities</h3>
      <ul>
        {outdoor.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>

      <h3>Indoor Amenities</h3>
      <ul>
        {indoor.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
