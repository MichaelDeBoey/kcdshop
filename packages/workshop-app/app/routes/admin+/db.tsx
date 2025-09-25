import { loadJSON } from '@epic-web/workshop-utils/data-storage.server'
import { readDb } from '@epic-web/workshop-utils/db.server'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed } from '#app/utils/misc.js'
import { LaunchEditor } from '../launch-editor.tsx'
import { type Route } from './+types/db.ts'

export async function loader() {
	ensureUndeployed()
	const db = await readDb()
	const { path: filepath } = await loadJSON()

	return { db, filepath }
}

export default function DbRoute({ loaderData }: Route.ComponentProps) {
	const { db, filepath } = loaderData
	return (
		<main>
			<h1 className="text-2xl font-bold">Database</h1>
			<div className="prose mt-4">
				{/* @ts-expect-error 🤷‍♂️ no idea */}
				<callout-danger>
					<strong>Warning:</strong> Editing the database directly can corrupt
					your data. Be very careful!
					{/* @ts-expect-error 🤷‍♂️ no idea */}
				</callout-danger>
			</div>
			<LaunchEditor
				file={filepath}
				className="flex max-w-full items-center gap-2"
			>
				<SimpleTooltip content="Open the database file in your editor">
					<Icon name="Files" className="h-4 w-4" title="Open in editor" />
				</SimpleTooltip>
				<span className="truncate" title={filepath}>
					{filepath}
				</span>
			</LaunchEditor>
			<pre className="mt-4 max-h-[400px] w-full overflow-auto rounded border bg-gray-900 p-4 text-sm text-white">
				{JSON.stringify(db, null, 2)}
			</pre>
		</main>
	)
}
