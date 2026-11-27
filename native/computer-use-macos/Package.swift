// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "OpenKodoComputerUseMacOS",
    platforms: [
        // Keep equal to MACOS_DEPLOYMENT_TARGET, the helper's LSMinimumSystemVersion (#20418).
        .macOS("13.4")
    ],
    products: [
        .library(
            name: "OpenKodoComputerUseMacOSCore",
            targets: ["OpenKodoComputerUseMacOSCore"]
        ),
        .executable(
            name: "openkodo-computer-use-macos",
            targets: ["OpenKodoComputerUseMacOS"]
        )
    ],
    targets: [
        .target(
            name: "OpenKodoComputerUseMacOSCore",
            path: "Sources/OpenKodoComputerUseMacOSCore"
        ),
        .executableTarget(
            name: "OpenKodoComputerUseMacOS",
            dependencies: ["OpenKodoComputerUseMacOSCore"],
            path: "Sources/OpenKodoComputerUseMacOS"
        ),
        .testTarget(
            name: "OpenKodoComputerUseMacOSTests",
            dependencies: ["OpenKodoComputerUseMacOSCore"],
            path: "Tests/OpenKodoComputerUseMacOSTests"
        )
    ]
)
