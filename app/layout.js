import "./globals.css";

export const metadata = {
  title: "Clinic Booking",
  description: "Book a clinic appointment slot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
