"use client";
import { useEffect } from "react";
import { startAppearanceSync } from "../lib/appearance";
export default function AppearanceSync() { useEffect(startAppearanceSync, []); return null; }
