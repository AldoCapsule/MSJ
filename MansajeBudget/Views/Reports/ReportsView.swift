import SwiftUI
import Charts

struct ReportsView: View {
    @EnvironmentObject var vm: ReportsViewModel
    @State private var selectedSegment = 0

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading {
                    ProgressView("Generating reports…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    reportsContent
                }
            }
            .navigationTitle("Reports")
        }
    }

    private var reportsContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Segment picker
                Picker("Report", selection: $selectedSegment) {
                    Text("By Category").tag(0)
                    Text("Over Time").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if selectedSegment == 0 {
                    categoryReport
                } else {
                    trendReport
                }
            }
            .padding(.bottom, 32)
        }
    }

    // MARK: - Category Report
    private var categoryReport: some View {
        VStack(spacing: 20) {
            // Donut Chart
            if !vm.categorySpends.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("This Month's Spending")
                        .font(.headline)
                        .padding(.horizontal)

                    Chart(vm.categorySpends) { item in
                        SectorMark(
                            angle: .value("Amount", item.amount),
                            innerRadius: .ratio(0.55),
                            angularInset: 2
                        )
                        .foregroundStyle(item.category.color)
                        .cornerRadius(4)
                    }
                    .frame(height: 260)
                    .padding(.horizontal)

                    // Legend
                    VStack(spacing: 0) {
                        ForEach(vm.categorySpends) { item in
                            HStack {
                                Circle()
                                    .fill(item.category.color)
                                    .frame(width: 12, height: 12)
                                Label(item.category.displayName, systemImage: item.category.systemImage)
                                    .font(.subheadline)
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(item.amount.asCurrency)
                                        .font(.subheadline.bold())
                                    Text(item.percentage.asPercent)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding()
                            if item.id != vm.categorySpends.last?.id {
                                Divider().padding(.leading)
                            }
                        }
                    }
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(16)
                    .padding(.horizontal)
                }
            } else {
                emptyChart(message: "No spending data for this month")
            }
        }
    }

    // MARK: - Trend Report
    private var trendReport: some View {
        VStack(spacing: 20) {
            if !vm.monthlyTotals.isEmpty {
                // Spending Line Chart
                VStack(alignment: .leading, spacing: 12) {
                    Text("Spending Trend (6 months)")
                        .font(.headline)
                        .padding(.horizontal)

                    Chart(vm.monthlyTotals) { item in
                        LineMark(
                            x: .value("Month", item.month, unit: .month),
                            y: .value("Spending", item.spending)
                        )
                        .foregroundStyle(Color.red)
                        .symbol(Circle())

                        LineMark(
                            x: .value("Month", item.month, unit: .month),
                            y: .value("Income", item.income)
                        )
                        .foregroundStyle(Color.green)
                        .symbol(Circle())

                        AreaMark(
                            x: .value("Month", item.month, unit: .month),
                            y: .value("Spending", item.spending)
                        )
                        .foregroundStyle(Color.red.opacity(0.1))
                    }
                    .frame(height: 220)
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .month)) { _ in
                            AxisGridLine()
                            AxisValueLabel(format: .dateTime.month(.abbreviated))
                        }
                    }
                    .chartYAxis { AxisMarks(format: .currency(code: "USD")) }
                    .padding(.horizontal)

                    // Legend
                    HStack(spacing: 24) {
                        Label("Spending", systemImage: "circle.fill")
                            .foregroundColor(.red)
                        Label("Income", systemImage: "circle.fill")
                            .foregroundColor(.green)
                    }
                    .font(.caption)
                    .padding(.horizontal)
                }
                .padding(.top, 8)

                // Monthly Summary Table
                VStack(alignment: .leading, spacing: 0) {
                    Text("Monthly Summary")
                        .font(.headline)
                        .padding()

                    ForEach(vm.monthlyTotals.reversed()) { item in
                        HStack {
                            Text(item.month.formatted_monthYear)
                                .font(.subheadline)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("-\(item.spending.asCurrency)")
                                    .font(.subheadline.bold())
                                    .foregroundColor(.red)
                                Text("+\(item.income.asCurrency)")
                                    .font(.caption)
                                    .foregroundColor(.green)
                            }
                        }
                        .padding()
                        if item.id != vm.monthlyTotals.reversed().last?.id {
                            Divider().padding(.leading)
                        }
                    }
                }
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                .padding(.horizontal)
            } else {
                emptyChart(message: "Not enough data yet")
            }
        }
    }

    private func emptyChart(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text(message)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }
}
