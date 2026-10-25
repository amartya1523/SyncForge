import type { Metadata } from 'next'
import { NetworkLab } from '@/components/lab/NetworkLab'

export const metadata: Metadata = {
  title: 'Network Lab — SyncForge',
  description: 'Three CRDT replicas on a hostile, simulated network. Break it and watch them converge.',
}

export default function LabPage() {
  return <NetworkLab />
}
