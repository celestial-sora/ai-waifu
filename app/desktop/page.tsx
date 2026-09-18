"use client";

import { useEffect } from "react";
import { CompanionApp } from "../page";

export default function DesktopPetPage() {
  useEffect(() => {
    document.documentElement.classList.add("desktop-pet-document");
    document.body.classList.add("desktop-pet-body");
    return () => {
      document.documentElement.classList.remove("desktop-pet-document");
      document.body.classList.remove("desktop-pet-body");
    };
  }, []);

  return <CompanionApp desktopMode />;
}
