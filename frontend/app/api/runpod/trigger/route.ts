import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { modelConfig, runpodApiKey, endpointId } = await req.json()

  if (!runpodApiKey || !endpointId) {
    return NextResponse.json({ error: "runpodApiKey and endpointId are required" }, { status: 400 })
  }

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runpodApiKey}`,
    },
    body: JSON.stringify({ input: modelConfig }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({ job_id: data.id })
}
