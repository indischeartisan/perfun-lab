import type { ComponentProps } from 'react'
import { Builder } from '../components/Builder'
export function BuildPage(props:ComponentProps<typeof Builder>){return <section className="build-screen"><Builder {...props}/></section>}
