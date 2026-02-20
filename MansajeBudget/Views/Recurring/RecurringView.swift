import SwiftUI

struct RecurringView: View {
    @ObservedObject var viewModel: RecurringViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var selectedTab = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !viewModel.entities.isEmpty {
                    HStack {
                        summaryPill(label: "Monthly total", value: viewModel.monthlyTotal.asCurrency, color: .blue)
                        Spacer()
                        if !viewModel.priceChanges.isEmpty {
                            summaryPill(label: "Price changes", value: "\(viewModel.priceChanges.count)", color: .orange)
                        }
                    }
                    .padding()
                }

                Picker("", selection: $selectedTab) {
                    Text("All").tag(0)
                    Text("Upcoming").tag(1)
                    Text("Subscriptions").tag(2)
                }
                .pickerStyle(.segmented).padding(.horizontal)

                Group {
                    if viewModel.isLoading && viewModel.entities.isEmpty {
                        ProgressView().padding(.top, 60)
                    } else {
                        let items = selectedTab == 0 ? viewModel.entities
                            : selectedTab == 1 ? viewModel.upcoming
                            : viewModel.subscriptions

                        if items.isEmpty {
                            emptyState
                        } else {
                            List(items) { entity in
                                RecurringEntityRow(entity: entity)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .navigationTitle("Recurring")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        if let uid = authViewModel.currentUser?.uid {
                            viewModel.load(uid: uid)
                            viewModel.recompute()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .onAppear {
            if let uid = authViewModel.currentUser?.uid { viewModel.load(uid: uid) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "repeat.circle.fill")
                .font(.system(size: 52)).foregroundColor(.secondary)
            Text("No Recurring Charges").font(.title3.bold())
            Text("Tap the refresh button to detect recurring charges from your transactions.")
                .foregroundColor(.secondary).multilineTextAlignment(.center).padding(.horizontal, 32)
            Spacer()
        }
    }

    private func summaryPill(label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline.bold()).foregroundColor(color)
            Text(label).font(.caption).foregroundColor(.secondary)
        }
    }
}

struct RecurringEntityRow: View {
    let entity: RecurringEntity

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(entity.isDueSoon ? Color.orange.opacity(0.15) : Color.accentColor.opacity(0.1))
                    .frame(width: 44, height: 44)
                Image(systemName: entity.cadence.systemImage)
                    .foregroundColor(entity.isDueSoon ? .orange : .accentColor)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(entity.merchantName).font(.subheadline.bold())
                    if entity.priceChangeFlag {
                        Image(systemName: "arrow.up.circle.fill").foregroundColor(.orange).font(.caption)
                    }
                }
                Text(entity.cadence.displayName).font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(entity.lastAmount.asCurrency).font(.subheadline.bold())
                if entity.isOverdue {
                    Text("Overdue").font(.caption).foregroundColor(.red)
                } else if entity.isDueSoon {
                    Text("Due in \(entity.daysUntilDue)d").font(.caption).foregroundColor(.orange)
                } else {
                    Text(entity.nextDueDate, style: .date).font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
