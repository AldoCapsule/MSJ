import SwiftUI
import Charts

struct HoldingsView: View {
    @ObservedObject var viewModel: InvestmentsViewModel
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.holdings.isEmpty {
                    ProgressView()
                } else if viewModel.holdings.isEmpty {
                    emptyState
                } else {
                    holdingsList
                }
            }
            .navigationTitle("Investments")
        }
        .onAppear {
            if let uid = authViewModel.currentUser?.uid { viewModel.load(uid: uid) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 52)).foregroundColor(.secondary)
            Text("No Holdings").font(.title2.bold())
            Text("Link an investment account to see your portfolio here.")
                .foregroundColor(.secondary).multilineTextAlignment(.center).padding(.horizontal, 32)
        }
        .padding()
    }

    private var holdingsList: some View {
        List {
            // Summary
            Section {
                VStack(spacing: 12) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Total Value").font(.caption).foregroundColor(.secondary)
                            Text(viewModel.totalValue.asCurrency).font(.title2.bold())
                        }
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text("Total Return").font(.caption).foregroundColor(.secondary)
                            HStack(spacing: 4) {
                                Image(systemName: viewModel.totalGainLoss >= 0 ? "arrow.up.right" : "arrow.down.right")
                                Text("\(viewModel.totalGainLoss.asCurrency) (\(String(format: "%.1f", viewModel.totalReturnPct))%)")
                                    .font(.subheadline.bold())
                            }
                            .foregroundColor(viewModel.totalGainLoss >= 0 ? .green : .red)
                        }
                    }
                    Text("Cost basis: \(viewModel.totalCostBasis.asCurrency)")
                        .font(.caption).foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section("Holdings") {
                ForEach(viewModel.holdings.sorted { $0.currentValue > $1.currentValue }) { holding in
                    HoldingRow(holding: holding)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.fetchHoldings() }
    }
}

struct HoldingRow: View {
    let holding: Holding

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(holding.symbol).font(.headline)
                Text("\(holding.quantity, specifier: "%.4g") shares").font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(holding.currentValue.asCurrency).font(.subheadline.bold())
                HStack(spacing: 2) {
                    Image(systemName: holding.isGain ? "arrow.up.right" : "arrow.down.right")
                        .font(.caption2)
                    Text(String(format: "%.1f%%", holding.returnPct))
                        .font(.caption)
                }
                .foregroundColor(holding.isGain ? .green : .red)
            }
        }
        .padding(.vertical, 2)
    }
}
