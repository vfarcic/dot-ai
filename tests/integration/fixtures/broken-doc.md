# Getting Started with FooBar

This guide walks you through setting up FooBar on your local machine.

## Prerequisites

Before you begin, make sure you have the following tools installed on your local machine because without them the setup process will not work correctly and you will encounter errors that are difficult to debug and may cause you to waste a significant amount of time troubleshooting issues that could have been easily avoided.

## Installation

### Step 1: Clone the Repository

```
git clone https://github.com/example/foobar.git
cd foobar
```

##### Step 2: Configure the Environment

Copy the example configuration file:

```
cp .env.example .env
```

Then edit `.env` and set your API key. See [the configuration reference](docs/nonexistent-config-guide.md) for details.

## Usage

The application is started by running the following command. Once the server has been started by the system, requests can be sent to it by the client.

```bash
foobar serve --port 8080
```

For more information, visit [our blog post](https://httpstat.us/404) about FooBar's architecture.

## Troubleshooting

If you encounter issues, the log files should be checked first. Errors are written to the log files by the application when something goes wrong.
