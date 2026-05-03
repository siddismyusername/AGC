import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Noto_Sans } from "next/font/google";

const notoSans = Noto_Sans({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "ArchGuard",
  description: "Architecture governance and conformance console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", notoSans.variable)}
    >
      <body className="min-h-screen">
        <ThemeProvider>
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
