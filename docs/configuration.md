# Configuration

The Epic Workshop app can be configured using the `epicshop` field in the
`package.json` file. This document outlines all available configuration options.

## Workshop Configuration

These options should be set in the root `package.json` of your workshop.

| Option                                 | Type      | Description                              | Default                                                                 |
| -------------------------------------- | --------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `title`                                | `string`  | The title of your workshop               | Required                                                                |
| `subtitle`                             | `string`  | A subtitle for your workshop             | Optional                                                                |
| `instructor`                           | `object`  | Information about the instructor         | Optional                                                                |
| `instructor.name`                      | `string`  | Name of the instructor                   | Optional                                                                |
| `instructor.avatar`                    | `string`  | Path to the instructor's avatar image    | Optional                                                                |
| `instructor.𝕏` or `instructor.xHandle` | `string`  | Instructor's X (formerly Twitter) handle | Optional                                                                |
| `product`                              | `object`  | Product configuration                    | Optional                                                                |
| `onboardingVideo`                      | `string`  | URL to the onboarding video              | `"https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app"` |
| `githubRepo`                           | `string`  | URL to the GitHub repository             | Required if `githubRoot` is not provided                                |
| `githubRoot`                           | `string`  | Root URL for GitHub file links           | Required if `githubRepo` is not provided                                |
| `stackBlitzConfig`                     | `object`  | Configuration for StackBlitz             | Optional                                                                |
| `forms.workshop`                       | `string`  | URL template for workshop feedback form  | Has a default value                                                     |
| `forms.exercise`                       | `string`  | URL template for exercise feedback form  | Has a default value                                                     |
| `testTab.enabled`                      | `boolean` | Whether to enable the test tab           | `true`                                                                  |
| `scripts.postupdate`                   | `string`  | Script to run after workshop update      | Optional                                                                |
| `initialRoute`                         | `string`  | Initial route for the app                | `"/"`                                                                   |

## Product Configuration

The `product` object can have the following properties:

| Option             | Type     | Description                                         | Default             |
| ------------------ | -------- | --------------------------------------------------- | ------------------- |
| `host`             | `string` | Host for the product (used for API calls and links) | `"www.epicweb.dev"` |
| `displayName`      | `string` | Display name of the product                         | `"EpicWeb.dev"`     |
| `displayNameShort` | `string` | Short display name of the product                   | `"Epic Web"`        |
| `logo`             | `string` | Path to the product logo                            | `"/logo.svg"`       |
| `slug`             | `string` | Slug for the product                                | Optional            |

> NOTE: in the future, we'll likely add localization to the Epicshop application
> so you can more easily define custom messages throughout the workshop UI.
> Until then, the `displayName` and `displayNameShort` will be used for all
> messages where the product name is displayed.

### Logo

You can provide a custom logo for your workshop. A regular image placed in the
workshop's `public` directory will do, but if you want to support
light/dark/monochrome themes, you can provide an SVG with definitions for each
theme.

Here's an example of the Epic React `logo.svg` file:

```svg
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
	<symbol id="monochrome" viewBox="0 0 133 140" fill="none">
		<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>

	<symbol id="light" viewBox="0 0 133 140" fill="none">
		<g stroke="#225FEB" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>

	<symbol id="dark" viewBox="0 0 133 140" fill="none">
		<g stroke="#81A7FF" stroke-linecap="round" stroke-linejoin="round" stroke-width="8">
			<path d="M100.109 69.173c17.025-13.337 26.625-26.064 23.035-32.283-5.086-8.809-34.715-1.225-66.177 16.94C25.505 71.994 4.123 93.86 9.21 102.67c2.741 4.747 12.61 4.733 26.051.869"></path>
			<path d="M87.724 78.505c-11.84 7.894-21.534 11.409-21.05 11.84 27.843 14.45 51.883 20.265 56.469 12.322 4.701-8.142-13.211-27.441-40.796-44.66M35.364 36.042c-13.495-3.894-23.406-3.92-26.154.84-3.618 6.267 6.157 19.14 23.426 32.589"></path>
			<path d="M80.33 27.68C76.952 13.21 71.866 4 66.177 4 56.005 4 47.76 33.45 47.76 69.78c0 36.329 8.246 65.78 18.418 65.78 5.605 0 10.626-8.941 14.004-23.048"></path>
		</g>
	</symbol>
</svg>
```

The critical bits there are the `symbol` definitions. These are used to
dynamically generate the logos for light/dark/monochrome themes. It's
recommended that `monochrome` use `currentColor` for the stroke or fill, so it
will use the correct color for the context in which it's viewed.

### Favicon

To adjust the favicon, simply add a `favicon.ico` and a `favicon.svg` file to
the `public` directory of your workshop repository. You can use media queries
for light/dark themes in the `favicon.svg` file.

### Open Graph Image

To adjust the open graph image, simply add an `og/background.png` file and a
`og/logo.svg` file to the `public` directory of your workshop repository. This
image will have an opacity of `0.3` (with a black background) to ensure text
overlay is legible. The workshop details will be overlayed on top of that image.

Additionally, instructor details which you configure in the root `package.json`
will be included in the open graph image.

## StackBlitz Configuration

The `stackBlitzConfig` object can have the following properties:

| Option        | Type                                  | Description                             |
| ------------- | ------------------------------------- | --------------------------------------- |
| `title`       | `string`                              | Title for the StackBlitz project        |
| `startScript` | `string`                              | Script to run when starting the project |
| `view`        | `"editor"` \| `"preview"` \| `"both"` | Initial view in StackBlitz              |
| `file`        | `string`                              | Initial file to open in StackBlitz      |

## App-specific Configuration

These options can be set in the `package.json` of individual exercises to
override the global settings.

| Option             | Type               | Description                                 |
| ------------------ | ------------------ | ------------------------------------------- |
| `stackBlitzConfig` | `object` \| `null` | Override or disable StackBlitz for this app |
| `testTab.enabled`  | `boolean`          | Enable or disable the test tab for this app |
| `initialRoute`     | `string`           | Set a custom initial route for this app     |

## Example Configuration

Here's an example of some configuration in the root `package.json`:

```
{
  "epicshop": {
    "title": "Advanced React Patterns",
    "subtitle": "Master complex React patterns",
    "instructor": {
      "name": "Kent C. Dodds",
      "avatar": "/images/instructor.png",
      "𝕏": "kentcdodds"
    },
    "product": {
      "displayName": "EpicReact.dev",
      "displayNameShort": "Epic React",
      "logo": "/images/logo.svg"
    },
    "githubRepo": "https://github.com/epicweb-dev/advanced-react-patterns",
    "stackBlitzConfig": {
      "view": "editor",
      "file": "src/App.tsx"
    },
    "forms": {
      "workshop": "https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}",
      "exercise": "https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}"
    },
    "testTab": {
      "enabled": true
    },
    "scripts": {
      "postupdate": "npm run build"
    },
    "initialRoute": "/welcome"
  }
}
```