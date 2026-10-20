import { createElement } from "react";
import { Box, type LucideProps } from "lucide-react";
import { getSupportedLucideIcon } from "@/lib/custom-subtypes";

interface DynamicLucideIconProps extends LucideProps {
  name: string;
}

export default function DynamicLucideIcon({ name, ...props }: DynamicLucideIconProps) {
  return createElement(getSupportedLucideIcon(name) ?? Box, props);
}
