'use client'
// components/Charts.tsx
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'

// Línea minimalista para tendencias (sparklines)
export function MiniLine({
  data,
  dataKey = 'value',
  xKey = 'label',
}: {
  data: Array<Record<string, any>>,
  dataKey?: string,
  xKey?: string
}) {
  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey={xKey} hide />
          <YAxis hide />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} dot={false} strokeWidth={2}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Barras simples (ej: ingresos vs gastos)
export function SimpleBars({
  data,
  xKey = 'label',
  yKey = 'value',
}: {
  data: Array<Record<string, any>>,
  xKey?: string,
  yKey?: string
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey={xKey}/>
          <YAxis />
          <Tooltip />
          <Bar dataKey={yKey}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Dona para composiciones (activos/pasivos/patrimonio)
export function Donut({
  data,
  nameKey = 'name',
  valueKey = 'value',
}: {
  data: Array<{ [k:string]: any }>,
  nameKey?: string,
  valueKey?: string
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={2}
          >
            {data.map((_, i) => (<Cell key={i} />))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
