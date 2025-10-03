import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import {
	getAppByName,
	getApps,
	getExercise,
	getExerciseApp,
	getExercises,
	getPlaygroundApp,
	getPlaygroundAppName,
	isExerciseStepApp,
	isProblemApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	logout,
	setAuthInfo,
} from '@epic-web/workshop-utils/db.server'
import { getDiffFiles } from '@epic-web/workshop-utils/diff.server'
import {
	getProgress,
	getUserInfo,
	updateProgress,
} from '@epic-web/workshop-utils/epic-api.server'
import { launchEditor } from '@epic-web/workshop-utils/launch-editor.server'
// @ts-ignore 🤷‍♂️ tshy doesn't like this
import { createUIResource } from '@mcp-ui/server'
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
	type CallToolResult,
	type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'
import * as client from 'openid-client'
import { z } from 'zod'
import { quizMe, quizMeInputSchema } from './prompts.js'
import {
	diffBetweenAppsResource,
	exerciseContextResource,
	exerciseStepContextResource,
	exerciseStepProgressDiffResource,
	userAccessResource,
	userInfoResource,
	userProgressResource,
	workshopContextResource,
} from './resources.js'
import {
	handleWorkshopDirectory,
	readInWorkshop,
	safeReadFile,
	workshopDirectoryInputSchema,
} from './utils.js'

// not enough support for this yet
const clientSupportsEmbeddedResources = false

export function initTools(server: McpServer) {
	server.registerTool(
		'login',
		{
			description:
				`Allow the user to login (or sign up) to the epic workshop.`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const {
				product: { host },
			} = getWorkshopConfig()
			const ISSUER = `https://${host}/oauth`
			const config = await client.discovery(new URL(ISSUER), 'EPICSHOP_APP')
			const deviceResponse = await client.initiateDeviceAuthorization(
				config,
				{},
			)

			void handleAuthFlow().catch(() => {})

			return {
				content: [
					{
						type: 'text',
						text: `Please go to ${deviceResponse.verification_uri_complete}. Verify the code on the page is "${deviceResponse.user_code}" to login.`,
					},
				],
			}

			async function handleAuthFlow() {
				const UserInfoSchema = z.object({
					id: z.string(),
					email: z.string(),
					name: z.string().nullable().optional(),
				})

				const timeout = setTimeout(() => {
					void server.server
						.notification({
							method: 'notification',
							params: {
								message: 'Device authorization timed out',
							},
						})
						.catch(() => {})
				}, deviceResponse.expires_in * 1000)

				try {
					const tokenSet = await client.pollDeviceAuthorizationGrant(
						config,
						deviceResponse,
					)
					clearTimeout(timeout)

					if (!tokenSet) {
						await server.server.notification({
							method: 'notification',
							params: {
								message: 'No token set',
							},
						})
						return
					}

					const protectedResourceResponse = await client.fetchProtectedResource(
						config,
						tokenSet.access_token,
						new URL(`${ISSUER}/userinfo`),
						'GET',
					)
					const userinfoRaw = await protectedResourceResponse.json()
					const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)
					if (!userinfoResult.success) {
						await server.server.notification({
							method: 'notification',
							params: {
								message: `Failed to parse user info: ${userinfoResult.error.message}`,
							},
						})
						return
					}
					const userinfo = userinfoResult.data

					await setAuthInfo({
						id: userinfo.id,
						tokenSet,
						email: userinfo.email,
						name: userinfo.name,
					})

					await getUserInfo({ forceFresh: true })

					await server.server.notification({
						method: 'notification',
						params: {
							message: 'Authentication successful',
						},
					})
				} catch (error) {
					clearTimeout(timeout)
					throw error
				}
			}
		},
	)

	server.registerTool(
		'logout',
		{
			description: `Allow the user to logout of the workshop (based on the workshop's host) and delete cache data.`,
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await logout()
			await deleteCache()
			return {
				content: [{ type: 'text', text: 'Logged out' }],
			}
		},
	)

	server.registerTool(
		'set_playground',
		{
			description: `
Sets the playground environment so the user can continue to that exercise or see
what that step looks like in their playground environment.

NOTE: this will override their current exercise step work in the playground!

Generally, it is better to not provide an exerciseNumber, stepNumber, and type
and let the user continue to the next exercise. Only provide these arguments if
the user explicitely asks to go to a specific exercise or step. If the user asks
to start an exercise, specify stepNumber 1 and type 'problem' unless otherwise
directed.

Argument examples:
A. If logged in and there is an incomplete exercise step, set to next incomplete exercise step based on the user's progress - Most common
	- [No arguments]
B. If not logged in or all exercises are complete, set to next exercise step from current (or first if there is none)
	- [No arguments]
C. Set to a specific exercise step
	- exerciseNumber: 1
	- stepNumber: 1
	- type: 'solution'
D. Set to the solution of the current exercise step
	- type: 'solution'
E. Set to the second step problem of the current exercise
	- stepNumber: 2
F. Set to the first step problem of the fifth exercise
	- exerciseNumber: 5

An error will be returned if no app is found for the given arguments.
	`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
				exerciseNumber: z.coerce
					.number()
					.optional()
					.describe('The exercise number to set the playground to'),
				stepNumber: z.coerce
					.number()
					.optional()
					.describe('The step number to set the playground to'),
				type: z
					.enum(['problem', 'solution'])
					.optional()
					.describe('The type of app to set the playground to'),
			},
		},
		async ({ workshopDirectory, exerciseNumber, stepNumber, type }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const authInfo = await getAuthInfo()

			if (!exerciseNumber) {
				if (authInfo) {
					const progress = await getProgress()
					const scoreProgress = (a: (typeof progress)[number]) => {
						if (a.type === 'workshop-instructions') return 0
						if (a.type === 'workshop-finished') return 10000
						if (a.type === 'instructions') return a.exerciseNumber * 100
						if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
						if (a.type === 'finished') return a.exerciseNumber * 100 + 100

						if (a.type === 'unknown') return 100000
						return -1
					}
					const sortedProgress = progress.sort((a, b) => {
						return scoreProgress(a) - scoreProgress(b)
					})
					const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
					if (nextProgress) {
						if (nextProgress.type === 'step') {
							const exerciseApp = await getExerciseApp({
								exerciseNumber: nextProgress.exerciseNumber.toString(),
								stepNumber: nextProgress.stepNumber.toString(),
								type: 'problem',
							})
							invariant(exerciseApp, 'No exercise app found')
							await setPlayground(exerciseApp.fullPath)
							return {
								content: [
									{
										type: 'text',
										text: `Playground set to ${exerciseApp.exerciseNumber}.${exerciseApp.stepNumber}.${exerciseApp.type}`,
									},
								],
							}
						}

						if (
							nextProgress.type === 'instructions' ||
							nextProgress.type === 'finished'
						) {
							throw new Error(
								`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'instructions' ? 'instructions' : 'finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
							)
						}
						if (
							nextProgress.type === 'workshop-instructions' ||
							nextProgress.type === 'workshop-finished'
						) {
							throw new Error(
								`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'workshop-instructions' ? 'Workshop instructions' : 'Workshop finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
							)
						}

						throw new Error(
							`The user needs to mark ${nextProgress.epicLessonSlug} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
						)
					}
				}
			}

			const apps = await getApps()
			const exerciseStepApps = apps.filter(isExerciseStepApp)

			const playgroundAppName = await getPlaygroundAppName()
			const currentExerciseStepAppIndex = exerciseStepApps.findIndex(
				(a) => a.name === playgroundAppName,
			)

			let desiredApp: ExerciseStepApp | undefined
			// if nothing was provided, set to the next step problem app
			const noArgumentsProvided = !exerciseNumber && !stepNumber && !type
			if (noArgumentsProvided) {
				desiredApp = exerciseStepApps
					.slice(currentExerciseStepAppIndex + 1)
					.find(isProblemApp)
				invariant(desiredApp, 'No next problem app found to set playground to')
			} else {
				const currentExerciseStepApp =
					exerciseStepApps[currentExerciseStepAppIndex]

				// otherwise, default to the current exercise step app for arguments
				exerciseNumber ??= currentExerciseStepApp?.exerciseNumber
				stepNumber ??= currentExerciseStepApp?.stepNumber
				type ??= currentExerciseStepApp?.type

				desiredApp = exerciseStepApps.find(
					(a) =>
						a.exerciseNumber === exerciseNumber &&
						a.stepNumber === stepNumber &&
						a.type === type,
				)
			}

			invariant(
				desiredApp,
				`No app found for values derived by the arguments: ${exerciseNumber}.${stepNumber}.${type}`,
			)
			await setPlayground(desiredApp.fullPath)
			return {
				content: [
					{
						type: 'text',
						text: `Playground set to ${desiredApp.name}.`,
					},
				],
			}
		},
	)

	server.registerTool(
		'update_progress',
		{
			description: `
Intended to help you mark an Epic lesson as complete or incomplete.

This will mark the Epic lesson as complete or incomplete and update the user's progress (get updated progress with the \`get_user_progress\` tool, the \`get_exercise_context\` tool, or the \`get_workshop_context\` tool).
		`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
				epicLessonSlug: z
					.string()
					.describe(
						'The slug of the Epic lesson to mark as complete (can be retrieved from the `get_exercise_context` tool or the `get_workshop_context` tool)',
					),
				complete: z
					.boolean()
					.optional()
					.default(true)
					.describe(
						'Whether to mark the lesson as complete or incomplete (defaults to true)',
					),
			},
		},
		async ({ workshopDirectory, epicLessonSlug, complete }) => {
			await handleWorkshopDirectory(workshopDirectory)
			await updateProgress({ lessonSlug: epicLessonSlug, complete })
			return {
				content: [
					{
						type: 'text',
						text: `Lesson with slug ${epicLessonSlug} marked as ${complete ? 'complete' : 'incomplete'}`,
					},
				],
			}
		},
	)

	// TODO: add a tool to run the dev/test script for the given app
}

// These are tools that retrieve resources. Not all resources should be
// accessible via tools, but allowing the LLM to access them on demand is useful
// for some situations.
export function initResourceTools(server: McpServer) {
	server.registerTool(
		'get_workshop_context',
		{
			description: `
Indended to help you get wholistic context of the topics covered in this
workshop. This doesn't go into as much detail per exercise as the
\`get_exercise_context\` tool, but it is a good starting point to orient
yourself on the workshop as a whole.
		`.trim(),
			inputSchema: workshopContextResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await workshopContextResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_exercise_context',
		{
			description: `
Intended to help a student understand what they need to do for the current
exercise step.

This returns the instructions MDX content for the current exercise and each
exercise step. If the user is has the paid version of the workshop, it will also
include the transcript from each of the videos as well.

The output for this will rarely change, so it's unnecessary to call this tool
more than once.

\`get_exercise_context\` is often best when used with the
\`get_exercise_step_progress_diff\` tool to help a student understand what
work they still need to do and answer any questions about the exercise.
		`.trim(),
			inputSchema: exerciseContextResource.inputSchema,
		},
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_diff_between_apps',
		{
			description: `
Intended to give context about the changes between two apps.

The output is a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve).

The output is formatted as a git diff.

App IDs are formatted as \`{exerciseNumber}.{stepNumber}.{type}\`.

If the user asks for the diff for 2.3, then use 02.03.problem for app1 and 02.03.solution for app2.
		`,
			inputSchema: diffBetweenAppsResource.inputSchema,
		},
		async ({ workshopDirectory, app1, app2 }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await diffBetweenAppsResource.getResource({
				workshopDirectory,
				app1,
				app2,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_exercise_step_progress_diff',
		{
			description: `
Intended to help a student understand what work they still have to complete.
		`.trim(),
			inputSchema: exerciseStepProgressDiffResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepProgressDiffResource.getResource({
				workshopDirectory,
			})
			return {
				content: [
					createText(getDiffInstructionText()),
					getEmbeddedResourceContent(resource),
				],
			}
		},
	)

	server.registerTool(
		'get_exercise_step_context',
		{
			description: `
Intended to help a student understand what they need to do for a specific
exercise step.

This returns the instructions MDX content for the specified exercise step's
problem and solution. If the user has the paid version of the workshop, it will also
include the transcript from each of the videos as well.

The output for this will rarely change, so it's unnecessary to call this tool
more than once for the same exercise step.

\`get_exercise_step_context\` is often best when used with the
\`get_exercise_step_progress_diff\` tool to help a student understand what
work they still need to do and answer any questions about the exercise step.
		`.trim(),
			inputSchema: exerciseStepContextResource.inputSchema,
		},
		async ({ workshopDirectory, exerciseNumber, stepNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await exerciseStepContextResource.getResource({
				workshopDirectory,
				exerciseNumber,
				stepNumber,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'view_video',
		{
			description: `
Intended to help a student view a video.

If the user ever asks you to show them a video, use this tool to do so.
		`.trim(),
			inputSchema: {
				videoUrl: z.string().describe(
					`
The URL of the video to view. If you don't know the URL to use already, you can get this from the \`get_exercise_step_context\` tool or the \`get_exercise_context\` tool depending on whether you're trying to show the exercise intro/outro video or a specific step's problem/solution video. If you use the \`get_what_is_next\` tool, this will be handled automatically.
						`.trim(),
				),
			},
		},
		async ({ videoUrl }) => {
			const url: URL = new URL('mcp-ui/epic-video', 'http://localhost:5639')
			url.searchParams.set('url', videoUrl)
			return {
				content: [
					createUIResource({
						content: {
							type: 'externalUrl',
							iframeUrl: url.toString(),
						},
						uri: `ui://epicshop/epic-video/${videoUrl.toString()}`,
						encoding: 'text',
					}),
				],
			}
		},
	)

	server.registerTool(
		'open_exercise_step_files',
		{
			title: 'Open Exercise Step Files',
			description: `
Call this to open the files for the exercise step the playground is currently set to.
		`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)
			const playgroundApp = await getPlaygroundApp()
			invariant(
				playgroundApp,
				'The playground app is not currently set. Use the `set_playground` tool to set the playground to an exercise step.',
			)
			const problemApp = await getAppByName(playgroundApp.appName)
			invariant(
				problemApp,
				'Cannot find the problem app for the playground app. This is unexpected. The playground app may need to be reset using the `set_playground` tool.',
			)
			invariant(
				isProblemApp(problemApp) && problemApp.solutionName,
				'The playground app is not set to a problem app with a solution. The playground app may need to be reset using the `set_playground` tool.',
			)
			const solutionApp = await getAppByName(problemApp.solutionName)
			invariant(
				solutionApp,
				'Cannot find the solution app for the problem app. Cannot open the files for a step that does not have both a problem and solution.',
			)
			const diffFiles = await getDiffFiles(problemApp, solutionApp)
			invariant(
				diffFiles,
				'There was a problem generating the diff. Check the terminal output.',
			)
			for (const file of diffFiles) {
				const fullPath = path.join(playgroundApp.fullPath, file.path)
				await launchEditor(fullPath, file.line)
			}
			return {
				content: [
					{
						type: 'text',
						text: `Opened ${diffFiles.length} file${diffFiles.length === 1 ? '' : 's'}:\n${diffFiles.map((file) => `${file.path}:${file.line}`).join('\n')}`,
					},
				],
			}
		},
	)

	server.registerTool(
		'get_user_info',
		{
			description: `
Intended to help you get information about the current user.

This includes the user's name, email, etc. It's mostly useful to determine
whether the user is logged in and know who they are.

If the user is not logged in, tell them to log in by running the \`login\` tool.
		`.trim(),
			inputSchema: userInfoResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userInfoResource.getResource({ workshopDirectory })
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_user_access',
		{
			description: `
Will tell you whether the user has access to the paid features of the workshop.

Paid features include:
- Transcripts
- Progress tracking
- Access to videos
- Access to the discord chat
- Test tab support
- Diff tab support

Encourage the user to upgrade if they need access to the paid features.
		`.trim(),
			inputSchema: userAccessResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userAccessResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)

	server.registerTool(
		'get_user_progress',
		{
			description: `
Intended to help you get the progress of the current user. Can often be helpful
to know what the next step that needs to be completed is. Make sure to provide
the user with the URL of relevant incomplete lessons so they can watch them and
then mark them as complete.
		`.trim(),
			inputSchema: userProgressResource.inputSchema,
		},
		async ({ workshopDirectory }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const resource = await userProgressResource.getResource({
				workshopDirectory,
			})
			return {
				content: [getEmbeddedResourceContent(resource)],
			}
		},
	)
}

// Sometimes the user will ask the LLM to select a prompt to use so they don't have to.
export function initPromptTools(server: McpServer) {
	server.registerTool(
		'get_quiz_instructions',
		{
			description: `
If the user asks you to quiz them on a topic from the workshop, use this tool to
retrieve the instructions for how to do so.

- If the user asks for a specific exercise, supply that exercise number.
- If they ask for a specific exericse, supply that exercise number.
- If they ask for a topic and you don't know which exercise that topic is in, use \`get_workshop_context\` to get the list of exercises and their topics and then supply the appropriate exercise number.
		`.trim(),
			inputSchema: quizMeInputSchema,
		},
		async ({ workshopDirectory, exerciseNumber }) => {
			workshopDirectory = await handleWorkshopDirectory(workshopDirectory)
			const result = await quizMe({ workshopDirectory, exerciseNumber })
			return {
				// QUESTION: will a prompt ever return messages that have role: 'assistant'?
				// if so, this may be a little confusing for the LLM, but I can't think of a
				// good use case for that so 🤷‍♂️
				content: result.messages.map((m) => {
					if (m.content.type === 'resource') {
						return getEmbeddedResourceContent(m.content.resource)
					}
					return m.content
				}),
			}
		},
	)

	server.registerTool(
		'get_what_is_next',
		{
			title: 'Get What Is Next',
			description: `
Intended to help you get the next step that the user needs to complete.

This is often useful to know what the user should do next to continue their learning.

This could be that they need to login, watch a video, complete an exercise, etc.
			`.trim(),
			inputSchema: {
				workshopDirectory: workshopDirectoryInputSchema,
			},
		},
		async ({ workshopDirectory }) => {
			await handleWorkshopDirectory(workshopDirectory)

			const authInfo = await getAuthInfo()
			if (!authInfo) {
				return {
					content: [
						{
							type: 'text',
							text: 'The user is not logged in. Use the `login` tool to login the user.',
						},
					],
				}
			}
			const progress = await getProgress()

			const scoreProgress = (a: (typeof progress)[number]) => {
				if (a.type === 'workshop-instructions') return 0
				if (a.type === 'workshop-finished') return 10000
				if (a.type === 'instructions') return a.exerciseNumber * 100
				if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
				if (a.type === 'finished') return a.exerciseNumber * 100 + 100

				if (a.type === 'unknown') return 100000
				return -1
			}
			const sortedProgress = progress.sort((a, b) => {
				return scoreProgress(a) - scoreProgress(b)
			})
			const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
			if (!nextProgress) {
				return {
					content: [
						{
							type: 'text',
							text: `The user has completed the workshop. Congratulate them and invite them to ask you to quiz them on their understanding of the material. A summary of the material is below:`,
						},
						createText(await createWorkshopSummary()),
					],
				}
			}

			invariant(
				nextProgress.type !== 'unknown',
				`Next progress type is unknown. This is unexpected. Sorry, we don't know what to do here. Here's a summary of the workshop:\n\n${await createWorkshopSummary()}`,
			)

			if (nextProgress.type === 'workshop-instructions') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				return {
					content: [
						createText(
							`The user has just begun! They need to watch the workshop instructions video and read the instructions to get started. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(await createWorkshopSummary()),
						createText(
							`Instructions:\n${await readInWorkshop('exercises', 'README.mdx')}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
				}
			}

			if (nextProgress.type === 'workshop-finished') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				return {
					content: [
						createText(
							`The user has almost completed the workshop. They just need to watch the workshop finished video and read the finished instructions to get started. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(
							`Finished instructions:\n${await readInWorkshop('exercises', 'FINISHED.mdx')}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
				}
			}

			const ex = nextProgress.exerciseNumber.toString().padStart(2, '0')
			if (nextProgress.type === 'instructions') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const exercise = await getExercise(nextProgress.exerciseNumber)
				return {
					content: [
						createText(
							`The user needs to complete the intro for exercise ${ex}. When they say they're done or ready for what's next, mark it as complete using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}" and then call \`get_what_is_next\` again to get the next step. Relevant info is below:`,
						),
						createText(
							`Exercise instructions:\n${await readReadme(exercise?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
				}
			}
			if (nextProgress.type === 'finished') {
				const embedUrl = new URL('mcp-ui/epic-video', 'http://localhost:5639')
				embedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const exercise = await getExercise(nextProgress.exerciseNumber)
				return {
					content: [
						createText(
							`The user is almost finished with exercise ${ex}. They need to complete the outro for exercise ${ex}. Relevant info is below:`,
						),
						createText(
							`Exercise finished instructions:\n${await readReadme(exercise?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: embedUrl.toString(),
							},
						}),
					],
				}
			}

			const st = nextProgress.stepNumber.toString().padStart(2, '0')
			if (nextProgress.type === 'step') {
				const exercise = await getExercise(nextProgress.exerciseNumber)
				const problemEmbedUrl = new URL(
					'mcp-ui/epic-video',
					'http://localhost:5639',
				)
				problemEmbedUrl.searchParams.set('url', nextProgress.epicLessonUrl)
				const solutionEmbedUrl = new URL(
					'mcp-ui/epic-video',
					'http://localhost:5639',
				)
				solutionEmbedUrl.searchParams.set(
					'url',
					`${nextProgress.epicLessonUrl}/solution`,
				)
				const step = exercise?.steps.find(
					(s) => s.stepNumber === nextProgress.stepNumber,
				)
				invariant(
					step,
					`No step found for exercise ${nextProgress.exerciseNumber} step ${nextProgress.stepNumber}`,
				)
				return {
					content: [
						createText(
							`
The user is on step ${st} of exercise ${ex}. To complete this step they need to:
1. Watch the problem video
2. Review the problem instructions (you can summarize these from the info below)
3. Set the playground to the problem app (you can help them using the \`set_playground\` tool)
4. Open the relevant files in their playground environment (you can help them using the \`open_exercise_step_files\` tool)
5. Run the tests and dev server to validate their work (no tools for this are available yet, but you can use the \`get_exercise_step_progress_diff\` tool to help them understand what work they still need to do as they go)
6. Watch the solution video
7. Review the solution instructions (you can summarize these from the info below)
8. Mark the step as complete (you can help them using the \`update_progress\` tool with the slug "${nextProgress.epicLessonSlug}")

Then you can call \`get_what_is_next\` again to get the next step.
							`.trim(),
						),
						createText(
							`Exercise step problem instructions:\n${await readReadme(step.problem?.fullPath)}`,
						),
						createText(
							`Exercise step solution instructions:\n${await readReadme(step.solution?.fullPath)}`,
						),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: problemEmbedUrl.toString(),
							},
						}),
						createUIResource({
							uri: `ui://epicshop/epic-video/${nextProgress.epicLessonUrl}/solution`,
							encoding: 'text',
							content: {
								type: 'externalUrl',
								iframeUrl: solutionEmbedUrl.toString(),
							},
						}),
					],
				}
			}
			throw new Error(
				`This is unexpected, but I do not know what the next step for the user is. Sorry!`,
			)
		},
	)
}

function getEmbeddedResourceContent(
	resource: ReadResourceResult['contents'][number],
) {
	if (clientSupportsEmbeddedResources) {
		return {
			type: 'resource' as const,
			resource,
		}
	} else if (typeof resource.text === 'string') {
		return {
			type: 'text' as const,
			text: resource.text,
		}
	} else {
		throw new Error(
			`Unknown resource type: ${resource.type} for ${resource.uri}`,
		)
	}
}

function createText(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text) }
	}
}

async function createWorkshopSummary() {
	const config = getWorkshopConfig()
	const exercises = await getExercises()
	let summary = `# ${config.title}

${config.subtitle}

## Exercises
`
	for (const exercise of exercises) {
		summary += `
${exercise.exerciseNumber.toString().padStart(2, '0')}. ${exercise.title}
${exercise.steps.map((s) => `  ${s.stepNumber.toString().padStart(2, '0')}. ${s.problem?.title ?? s.solution?.title ?? 'No title'}`).join('\n')}`
	}
	return summary
}

async function readReadme(dirPath?: string) {
	return (
		(dirPath ? await safeReadFile(path.join(dirPath, 'README.mdx')) : null) ??
		'No instructions'
	)
}

function getDiffInstructionText() {
	return `
Below is the diff between the user's work in progress and the solution.
Lines starting with \`-\` show code that needs to be removed from the user's solution.
Lines starting with \`+\` show code that needs to be added to the user's solution.

If there are significant differences, the user's work is incomplete.

Here's an example of the output you can expect:

--------

diff --git ./example.ts ./example.ts
index e05035d..a70eb4b 100644
--- ./example.ts
+++ ./example.ts
@@ -236,14 +236,27 @@ export async function sayHello(name?: string) {
+	if (name) {
+		return \`Hello, \${name}!\`
+	}
-	await new Promise((resolve) => setTimeout(resolve, 1000))
 	return 'Hello, World!'
 }

--------

In this example, you should tell the user they still need to:
- add the if statement to return the name if it's provided
- remove the await promise that resolves after 1 second

For additional context, you can use the \`get_exercise_instructions\` tool
to get the instructions for the current exercise step to help explain the
significance of changes.
	`.trim()
}
