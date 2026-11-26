import MapKit
import SwiftUI

@main
struct CrosswiseApp: App {
    var body: some Scene {
        WindowGroup {
            WalkingMap()
        }
    }
}

private struct WalkingMap: View {
    @State private var camera: MapCameraPosition = .region(Self.bedford)
    @State private var start = ""
    @State private var destination = ""
    @State private var route: MKRoute?
    @State private var errorMessage: String?
    @State private var isPlanning = false

    private static let bedford = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 42.49, longitude: -71.27),
        latitudinalMeters: 8_000,
        longitudinalMeters: 8_000
    )

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 12) {
                    TextField("From address", text: $start)
                        .textContentType(.fullStreetAddress)
                    TextField("To address", text: $destination)
                        .textContentType(.fullStreetAddress)
                    Button("Find walking route", systemImage: "figure.walk") {
                        Task { await planRoute() }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(isPlanning || start.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if isPlanning {
                        ProgressView("Finding route…")
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .textFieldStyle(.roundedBorder)
                .disabled(isPlanning)
                .padding()

                Map(position: $camera) {
                    if let route {
                        MapPolyline(route.polyline)
                            .stroke(.blue, lineWidth: 5)
                    }
                }
                .mapControls {
                    MapCompass()
                    MapScaleView()
                }

                if let route {
                    List {
                        Section("Walking directions") {
                            Text("\(route.distance / 1_609.344, specifier: "%.2f") mi · \(max(1, Int((route.expectedTravelTime / 60).rounded()))) min")
                                .font(.headline)
                            ForEach(route.steps.indices, id: \.self) { index in
                                let step = route.steps[index]
                                if !step.instructions.isEmpty {
                                    Text(step.instructions)
                                }
                            }
                        }
                    }
                    .frame(height: 180)
                }
            }
            .navigationTitle("Crosswise")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func planRoute() async {
        isPlanning = true
        errorMessage = nil
        route = nil
        defer { isPlanning = false }

        do {
            let request = MKDirections.Request()
            request.source = try await findAddress(start, field: "From")
            request.destination = try await findAddress(destination, field: "To")
            request.transportType = .walking

            let response = try await MKDirections(request: request).calculate()
            guard let walkingRoute = response.routes.first else {
                errorMessage = "No walking route was found between those addresses."
                return
            }
            route = walkingRoute
            camera = .rect(walkingRoute.polyline.boundingMapRect)
        } catch let error as AddressError {
            errorMessage = "No match for the \(error.field) address. Try adding the street number and town."
        } catch {
            errorMessage = "Couldn’t load walking directions. Check your connection and try again."
        }
    }

    private func findAddress(_ address: String, field: String) async throws -> MKMapItem {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = address.trimmingCharacters(in: .whitespacesAndNewlines)
        request.region = Self.bedford
        request.resultTypes = .address
        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else {
                throw AddressError(field: field)
            }
            return item
        } catch let error as MKError where error.code == .placemarkNotFound {
            throw AddressError(field: field)
        }
    }

    private struct AddressError: Error {
        let field: String
    }
}
