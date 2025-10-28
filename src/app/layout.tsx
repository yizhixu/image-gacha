export const metadata = {
  title: "AI Gacha Images",
  description: "Multi-model image generation via Kie.ai"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial" }}>
        {children}
      </body>
    </html>
  )
}

