import React from "react";

export function Card({ children, className = "", title }) {
  return (
    <div className={`rounded border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {title && (
        <div className="mb-4 border-b border-gray-200 pb-3">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}
