import { NextRequest, NextResponse } from "next/server"

/** Proxy RunPod job status. Key is passed in the request body — never stored. */
export async function POST(req: NextRequest) {
  const { jobId, endpointId, runpodApiKey } = await req.json()

  if (!jobId || !endpointId || !runpodApiKey) {
    return NextResponse.json({ error: "jobId, endpointId, and runpodApiKey are required" }, { status: 400 })
  }

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${runpodApiKey}` },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
