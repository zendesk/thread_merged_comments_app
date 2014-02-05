:warning: *Use of this software is subject to important terms and conditions as set forth in the License file* :warning:

# Thread Merged Comments App

## Description:

This app generates a printer-friendly HTML file containing comments from the current ticket threaded chronologically with comments from any tickets that have been merged into the current ticket.

## App location:

* Ticket sidebar

## Features:

* Will gather comments from as many tickets as have been merged into the current ticket 
* Displays an error if no tickets have been merged into the current ticket
* Uses a stylesheet based on Zendesk's built-in print CSS

## Limitations:

* The app is confirmed to work in the latest versions Firefox and Chrome. Browsers that do not support HTML5 Blob implementations may not work with this app.
* In Zendesk it is possible to merge ticket A into ticket B and then merge ticket B into ticket C. If this app is run on ticket C, it will only retrieve comments present on ticket B (comments on ticket A will be excluded). In other words, the app will only get comments for the tickets that were mered directly into the current ticket.

## Set-up/installation instructions:

No setup is required.

## Contribution:

Pull requests are welcome.

## Screenshot(s):

![](https://doithd.zendesk.com/attachments/token/kkwpry6wb4drsyf/?name=thread_merged_comments.gif)