import { Instrument_Serif, Space_Grotesk } from "next/font/google";
import "./book.css";
import Track from "./Track";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const grotesk = Space_Grotesk({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-grotesk",
});

export const metadata = {
  title: "Windrooms — Rooms at Flyspot Gdańsk",
  description:
    "Six self check-in rooms inside the Flyspot building, five minutes from Gdańsk Airport. Door codes, no reception, open 24/7.",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} ${grotesk.variable} min-h-screen`}>
      <Track />
      {children}
    </div>
  );
}
