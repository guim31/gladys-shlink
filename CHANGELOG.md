# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-26

### Added

- The Shlink server as a device: reachable, short links, visits in all and
  today, bot visits today.
- One device per short link added from the Discover tab: visits in all and
  today, date and time of the last visit (bots excluded).
- Scene triggers: new visit on a followed link (country and referring site
  when Shlink knows them, bots excluded unless the option says otherwise),
  Shlink unreachable, Shlink reachable again.
- Scene action "Read a short link", with a ready-made sentence.
- Dashboard widget: visits of the day and the most visited links.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-shlink/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-shlink/releases/tag/v1.0.0
